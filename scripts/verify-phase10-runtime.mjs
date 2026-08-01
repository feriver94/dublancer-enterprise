import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const databasePort = Number(process.env.PHASE10_DATABASE_PORT ?? 55450);
const applicationPort = Number(process.env.PHASE10_APPLICATION_PORT ?? 3120);
const sinkPort = Number(process.env.PHASE10_SINK_PORT ?? 4220);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const sinkUrl = `http://127.0.0.1:${sinkPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase10-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);

const children = new Set();
const nextLogs = [];
const invalidations = [];
const federationRequests = [];
const internalWorkerSecret = `${randomUUID()}${randomUUID()}`;
const invalidationSecret = `${randomUUID()}${randomUUID()}`;
const federationToken = `${randomUUID()}${randomUUID()}`;
let federatedProjectId;

class CookieJar {
  cookies = new Map();

  absorb(response) {
    const values =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const cookie = value.split(";", 1)[0];
      const separator = cookie.indexOf("=");
      if (separator > 0) {
        this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
      }
    }
  }

  header() {
    return [...this.cookies]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runRequired(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(command, args, env);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} failed:\n${output}`)),
    );
  });
}

async function waitForPort(port, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(300, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for port ${port}.`);
}

async function waitForApplication() {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health/live`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Application did not become ready.\n${nextLogs.slice(-80).join("")}`,
  );
}

async function browserRequest(
  jar,
  route,
  { method = "GET", body, expected = [200], csrf = method !== "GET", headers = {} } = {},
) {
  let csrfToken;
  if (csrf) {
    const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: jar?.header() ? { cookie: jar.header() } : {},
    });
    jar?.absorb(bootstrap);
    assert.equal(bootstrap.status, 200);
    csrfToken = (await bootstrap.json()).data.csrfToken;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    redirect: "manual",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(jar?.header() ? { cookie: jar.header() } : {}),
      origin: baseUrl,
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response);
  const envelope = await response.json().catch(() => ({}));
  assert.ok(
    expected.includes(response.status),
    `${method} ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`,
  );
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase10-${label}-${randomUUID()}@example.test`;
  const password = "Phase10!Enterprise123";
  const registration = await browserRequest(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase 10 ${label}`, password },
  });
  await browserRequest(jar, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      organizationId: registration.data.organizationId,
      deviceLabel: `${label} production verification`,
    },
  });
  return {
    jar,
    email,
    password,
    userId: registration.data.id,
    organizationId: registration.data.organizationId,
  };
}

async function login(actorRecord, organizationId) {
  const jar = new CookieJar();
  await browserRequest(jar, "/api/auth/login", {
    method: "POST",
    body: {
      email: actorRecord.email,
      password: actorRecord.password,
      organizationId,
      deviceLabel: "Phase 10 tenant verification",
    },
  });
  return jar;
}

let pglite;
let socketServer;
let prisma;
let sink;
let failure;

try {
  sink = createServer((request, response) => {
    void (async () => {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      if (request.url === "/cache") {
        invalidations.push({
          body,
          secret: request.headers["x-cache-invalidation-secret"],
        });
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ invalidated: true }));
        return;
      }
      if (request.url === "/search") {
        federationRequests.push({
          body,
          authorization: request.headers.authorization,
        });
        const now = new Date().toISOString();
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            items: [
              {
                organizationId: body.organizationId,
                entityType: "PROJECT",
                entityId: "regional-project-evidence",
                title: "Phase 10 federated regional evidence",
                body: "External search federation remains tenant and project scoped.",
                locale: "en-AE",
                projectId: federatedProjectId,
                fileNodeId: null,
                requiredPermission: "project.read",
                indexedAt: now,
                rank: 0.96,
                highlight: "Phase 10 [[[federated]]] evidence",
                metadata: { source: "phase10-runtime" },
              },
              {
                organizationId: "cross-tenant-organization",
                entityType: "PROJECT",
                entityId: "forbidden-cross-tenant-evidence",
                title: "Forbidden cross-tenant result",
                body: "This result must be filtered.",
                locale: "en-AE",
                projectId: federatedProjectId,
                fileNodeId: null,
                requiredPermission: "project.read",
                indexedAt: now,
                rank: 1,
                highlight: "Forbidden",
                metadata: null,
              },
            ],
          }),
        );
        return;
      }
      response.writeHead(404).end();
    })().catch((error) => response.writeHead(500).end(String(error)));
  });
  await new Promise((resolve) => sink.listen(sinkPort, "127.0.0.1", resolve));

  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (
    await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations.length, 18, "Phase 10 must apply exactly 18 migrations.");
  assert.equal(
    migrations.at(-1),
    "20260730150000_enterprise_production_performance",
  );
  for (const migration of migrations) {
    await pglite.exec(
      await readFile(
        path.join(root, "prisma/migrations", migration, "migration.sql"),
        "utf8",
      ),
    );
    process.stdout.write(`Applied migration ${migration}\n`);
  }
  socketServer = new PGLiteSocketServer({
    db: pglite,
    port: databasePort,
    host: "127.0.0.1",
    maxConnections: 40,
  });
  await socketServer.start();
  await waitForPort(databasePort);

  const memoryShim = path.join(temporary, "memory-shim.cjs");
  await writeFile(
    memoryShim,
    `const original=process.memoryUsage;function empty(){return{rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0}}function safe(){try{return original()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return empty();throw error}}safe.rss=()=>{try{return original.rss()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return 0;throw error}};process.memoryUsage=safe;`,
    "utf8",
  );
  const env = {
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: "1",
    APP_BASE_URL: baseUrl,
    AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
    IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    MFA_BACKUP_CODE_PEPPER: `${randomUUID()}${randomUUID()}`,
    INTEGRATION_API_KEY_PEPPER: `${randomUUID()}${randomUUID()}`,
    INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_EMAIL_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_WORKER_SECRET: internalWorkerSecret,
    CACHE_INVALIDATION_PEERS: `${sinkUrl}/cache`,
    CACHE_INVALIDATION_SECRET: invalidationSecret,
    CACHE_FORCE_PRIMARY_FAILURE: "1",
    SEARCH_FEDERATION_ENDPOINTS: `${sinkUrl}/search`,
    SEARCH_FEDERATION_TOKEN: federationToken,
    SEARCH_FEDERATION_TIMEOUT_MS: "1000",
    DEPLOYMENT_ENVIRONMENT: "production-verification",
    DEPLOYMENT_REGION: "uae-north",
    DEPLOYMENT_REGIONS: "uae-north,europe-west",
    DISASTER_RECOVERY_REGION: "europe-west",
    APP_VERSION: "1.0.0",
    REDIS_URL: "redis://127.0.0.1:1",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: prismaTemporary,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim(),
  };
  await runRequired(process.execPath, ["prisma/seed.mjs"], env);
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(
    path.join(root, "node_modules/.bin/next"),
    ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)],
    env,
  );
  for (const stream of [next.stdout, next.stderr]) {
    stream.on("data", (chunk) => {
      nextLogs.push(chunk.toString());
      if (nextLogs.length > 700) nextLogs.shift();
    });
  }
  await waitForApplication();

  const owner = await actor("owner");
  const outsider = await actor("outsider");
  const viewerRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: owner.organizationId, name: "Viewer" },
  });
  await prisma.membership.create({
    data: {
      userId: outsider.userId,
      organizationId: owner.organizationId,
      roleId: viewerRole.id,
      status: "ACTIVE",
    },
  });
  const organizationViewerJar = await login(outsider, owner.organizationId);

  const project = (
    await browserRequest(owner.jar, "/api/projects", {
      method: "POST",
      expected: [201],
      body: {
        title: "Phase 10 production verification",
        slug: `phase10-production-${randomUUID().slice(0, 8)}`,
        description: "Multi-region production release verification project.",
        currency: "AED",
      },
    })
  ).data;
  federatedProjectId = project.id;

  const options = await browserRequest(
    owner.jar,
    `/api/projects/${project.id}/members`,
  );
  assert.ok(options.data.eligible.some((item) => item.userId === outsider.userId));
  await browserRequest(owner.jar, `/api/projects/${project.id}/members`, {
    method: "POST",
    expected: [201],
    body: { userId: outsider.userId, role: "CONTRIBUTOR" },
  });

  const predecessorTask = (
    await browserRequest(owner.jar, `/api/projects/${project.id}/tasks`, {
      method: "POST",
      expected: [201],
      body: {
        title: "Sprint blocker predecessor",
        status: "TODO",
        priority: "HIGH",
        position: 0,
      },
    })
  ).data;
  const successorTask = (
    await browserRequest(owner.jar, `/api/projects/${project.id}/tasks`, {
      method: "POST",
      expected: [201],
      body: {
        title: "Sprint blocker assigned task",
        assigneeId: outsider.userId,
        status: "BLOCKED",
        priority: "URGENT",
        position: 1,
      },
    })
  ).data;
  const unread = await browserRequest(organizationViewerJar, "/api/notifications/unread-count");
  assert.ok(unread.data.count >= 1);
  const projectNotifications = await browserRequest(
    organizationViewerJar,
    "/api/notifications?category=PROJECT&status=UNREAD&take=10",
  );
  const assignmentNotification = projectNotifications.data.find(
    (item) => item.metadata?.taskId === successorTask.id,
  );
  assert.ok(assignmentNotification, "Project assignment must create an unread notification.");
  assert.ok(
    await prisma.realtimeEvent.findFirst({
      where: {
        aggregateId: assignmentNotification.id,
        eventType: "notification.created",
        topic: `user:${outsider.userId}`,
      },
    }),
    "Project notification must publish a realtime event.",
  );
  await browserRequest(
    organizationViewerJar,
    `/api/notifications/${assignmentNotification.id}/read`,
    { method: "POST" },
  );
  assert.equal(
    (await prisma.userNotification.findUniqueOrThrow({ where: { id: assignmentNotification.id } })).status,
    "READ",
  );
  await browserRequest(
    organizationViewerJar,
    `/api/notifications/${assignmentNotification.id}/archive`,
    { method: "POST" },
  );
  assert.equal(
    (await prisma.userNotification.findUniqueOrThrow({ where: { id: assignmentNotification.id } })).status,
    "ARCHIVED",
  );

  await browserRequest(owner.jar, `/api/projects/${project.id}/delivery`, {
    method: "POST",
    expected: [201],
    body: {
      type: "dependency",
      predecessorTaskId: predecessorTask.id,
      successorTaskId: successorTask.id,
      dependencyType: "FINISH_TO_START",
      lagMinutes: 0,
    },
  });
  await browserRequest(owner.jar, `/api/projects/${project.id}/delivery`, {
    method: "POST",
    expected: [422],
    body: {
      type: "dependency",
      predecessorTaskId: predecessorTask.id,
      successorTaskId: predecessorTask.id,
      dependencyType: "FINISH_TO_START",
      lagMinutes: 0,
    },
  });
  await browserRequest(owner.jar, `/api/projects/${project.id}/delivery`, {
    method: "POST",
    expected: [409],
    body: {
      type: "dependency",
      predecessorTaskId: successorTask.id,
      successorTaskId: predecessorTask.id,
      dependencyType: "FINISH_TO_START",
      lagMinutes: 0,
    },
  });
  const deliveryHealth = await browserRequest(owner.jar, `/api/projects/${project.id}/delivery`);
  assert.equal(deliveryHealth.data.health.current.signals.blockedDependencies, 1);
  assert.ok(deliveryHealth.data.health.current.score < 100);

  const draftContract = (
    await browserRequest(owner.jar, "/api/contracts", {
      method: "POST",
      expected: [201],
      body: {
        projectId: project.id,
        title: "Sprint lifecycle contract",
        valueMinor: 125000,
        currency: "AED",
        taxRateBasisPoints: 500,
        platformFeeBasisPoints: 250,
        terms: { scope: "Release blocker verification" },
      },
    })
  ).data;
  const editedContract = (
    await browserRequest(owner.jar, `/api/contracts/${draftContract.id}`, {
      method: "PATCH",
      body: {
        expectedVersion: draftContract.version,
        title: "Sprint lifecycle contract updated",
        projectId: project.id,
        terms: { scope: "Verified contract edit" },
      },
    })
  ).data;
  assert.equal(editedContract.title, "Sprint lifecycle contract updated");
  assert.equal(editedContract.project.id, project.id);
  assert.ok((await browserRequest(owner.jar, "/api/contracts")).data.some((item) => item.id === draftContract.id));
  await browserRequest(owner.jar, `/api/contracts/${draftContract.id}`, {
    method: "DELETE",
    body: { confirmation: "DELETE", expectedVersion: editedContract.version },
  });
  assert.equal(await prisma.contract.count({ where: { id: draftContract.id } }), 0);
  const searchableContract = (
    await browserRequest(owner.jar, "/api/contracts", {
      method: "POST",
      expected: [201],
      body: {
        projectId: project.id,
        title: "Sprint searchable contract",
        valueMinor: 250000,
        currency: "AED",
        terms: { scope: "Global search verification" },
      },
    })
  ).data;

  const controlCenter = await browserRequest(owner.jar, "/api/enterprise/control-center");
  assert.equal(controlCenter.data.organization.id, owner.organizationId);
  assert.equal(typeof controlCenter.data.security.score, "number");
  const department = (
    await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
      method: "POST",
      expected: [201],
      body: { action: "department.create", name: "Sprint Operations" },
    })
  ).data;
  const team = (
    await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
      method: "POST",
      expected: [201],
      body: { action: "team.create", name: "Release Blockers", departmentId: department.id },
    })
  ).data;
  await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
    method: "POST",
    body: { action: "team.update", id: team.id, name: "Release Readiness" },
  });
  await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/invitations/bulk`, {
    method: "POST",
    expected: [201],
    body: { invitations: [{ email: `sprint-invite-${randomUUID()}@example.test`, roleId: viewerRole.id, expiresInHours: 168 }] },
  });
  const createdOrganization = (
    await browserRequest(owner.jar, "/api/organizations", {
      method: "POST",
      expected: [201],
      body: { name: "Sprint Isolated Tenant", slug: `sprint-isolated-${randomUUID().slice(0, 8)}` },
    })
  ).data;
  assert.ok(await prisma.membership.findFirst({ where: { organizationId: createdOrganization.id, userId: owner.userId, status: "ACTIVE" } }));
  const refreshedControlCenter = await browserRequest(owner.jar, "/api/enterprise/control-center");
  assert.ok(refreshedControlCenter.data.counters.organizations >= 2);
  assert.equal(refreshedControlCenter.data.counters.departments, 1);
  assert.equal(refreshedControlCenter.data.counters.teams, 1);
  assert.ok(refreshedControlCenter.data.counters.pendingInvitations >= 1);
  await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
    method: "POST",
    body: { action: "team.delete", id: team.id },
  });
  await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
    method: "POST",
    body: { action: "department.update", id: department.id, name: "Sprint Operations Updated" },
  });
  await browserRequest(owner.jar, `/api/organizations/${owner.organizationId}/administration`, {
    method: "POST",
    body: { action: "department.delete", id: department.id },
  });
  await browserRequest(
    owner.jar,
    `/api/projects/${project.id}/members/${outsider.userId}`,
    { method: "PATCH", body: { role: "VIEWER" } },
  );
  await browserRequest(organizationViewerJar, `/api/projects/${project.id}`);
  await browserRequest(
    owner.jar,
    `/api/projects/${project.id}/members/${owner.userId}`,
    { method: "PATCH", body: { role: "VIEWER" }, expected: [409] },
  );
  await browserRequest(
    owner.jar,
    `/api/projects/${project.id}/members/${outsider.userId}`,
    { method: "DELETE", body: { confirmation: "REMOVE" } },
  );
  await browserRequest(organizationViewerJar, `/api/projects/${project.id}`, {
    expected: [403],
  });
  await browserRequest(outsider.jar, `/api/projects/${project.id}/members`, {
    expected: [404],
  });

  const federated = await browserRequest(
    owner.jar,
    "/api/search?q=phase10-federated-evidence&entityType=project&take=5",
  );
  assert.equal(federated.data.length, 1);
  assert.equal(federated.data[0].entityId, "regional-project-evidence");
  assert.equal(federationRequests.length, 1);
  assert.equal(federationRequests[0].authorization, `Bearer ${federationToken}`);
  assert.equal(federationRequests[0].body.organizationId, owner.organizationId);

  const unauthenticatedInvalidation = await fetch(
    `${baseUrl}/api/internal/cache/invalidate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: owner.organizationId,
        sourceRegion: "europe-west",
        reason: "unauthenticated-test",
      }),
    },
  );
  assert.equal(unauthenticatedInvalidation.status, 401);
  const inboundInvalidation = await fetch(
    `${baseUrl}/api/internal/cache/invalidate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cache-invalidation-secret": invalidationSecret,
      },
      body: JSON.stringify({
        organizationId: owner.organizationId,
        sourceRegion: "europe-west",
        reason: "regional-runtime-test",
      }),
    },
  );
  assert.equal(inboundInvalidation.status, 200);
  assert.equal(invalidations.length, 0, "Inbound invalidation must not loop.");

  const searchableFile = await prisma.fileNode.create({
    data: {
      organizationId: owner.organizationId,
      projectId: project.id,
      createdById: owner.userId,
      type: "FILE",
      name: "Sprint release evidence.txt",
      currentVersionNumber: 1,
      versions: {
        create: {
          uploadedById: owner.userId,
          version: 1,
          storageProvider: "runtime",
          storageKey: `sprint-runtime/${randomUUID()}`,
          mimeType: "text/plain",
          sizeBytes: 128n,
          checksumSha256: "a".repeat(64),
          scanStatus: "CLEAN",
          scannedAt: new Date(),
        },
      },
    },
  });

  await browserRequest(owner.jar, "/api/search/reindex", {
    method: "POST",
    expected: [202],
    body: { idempotencyKey: `phase10-${randomUUID()}` },
  });
  const worker = await fetch(`${baseUrl}/api/internal/workers/search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${internalWorkerSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workerId: "phase10-search-worker", action: "PROCESS" }),
  });
  assert.equal(worker.status, 202);
  assert.equal(invalidations.length, 1);
  assert.equal(invalidations[0].secret, invalidationSecret);
  assert.equal(invalidations[0].body.organizationId, owner.organizationId);
  assert.equal(invalidations[0].body.sourceRegion, "uae-north");

  for (const [entityType, query, entityId] of [
    ["project", "production", project.id],
    ["task", "assigned", successorTask.id],
    ["user", "owner", owner.userId],
    ["file", "release", searchableFile.id],
    ["contract", "searchable", searchableContract.id],
    ["organization", "Workspace", owner.organizationId],
  ]) {
    const result = await browserRequest(
      owner.jar,
      `/api/search?q=${encodeURIComponent(query)}&entityType=${entityType}&take=10`,
    );
    assert.ok(
      result.data.some((item) => item.entityId === entityId),
      `Global search must find ${entityType} ${entityId}.`,
    );
  }

  const oversizedBatch = await fetch(`${baseUrl}/api/internal/workers/runtime`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${internalWorkerSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workerId: "phase10-runtime-worker",
      action: "PROCESS_BATCH",
      batchSize: 26,
    }),
  });
  assert.equal(oversizedBatch.status, 422);
  const boundedBatch = await fetch(`${baseUrl}/api/internal/workers/runtime`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${internalWorkerSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workerId: "phase10-runtime-worker",
      action: "PROCESS_BATCH",
      batchSize: 3,
    }),
  });
  assert.equal(boundedBatch.status, 202);
  const batchEnvelope = await boundedBatch.json();
  assert.ok(batchEnvelope.data.processed >= 0 && batchEnvelope.data.processed <= 3);

  const capacity = await browserRequest(owner.jar, "/api/observability/capacity");
  assert.equal(capacity.data.deployment.environment, "production-verification");
  assert.equal(capacity.data.deployment.region, "uae-north");
  assert.deepEqual(capacity.data.deployment.regions, ["uae-north", "europe-west"]);
  assert.equal(capacity.data.cache.invalidationPeers, 1);
  assert.equal(capacity.data.cache.strategy, "redis-primary-local-lru-fallback");
  const observability = await browserRequest(owner.jar, "/api/observability/dashboard");
  assert.equal(typeof observability.data.live.errorRatePercent, "number");
  assert.equal(typeof observability.data.live.availabilityPercent, "number");
  assert.equal(typeof observability.data.live.p95LatencyMs, "number");
  assert.equal(typeof observability.data.live.workers.active, "number");
  assert.equal(typeof observability.data.live.queue.pending, "number");

  for (const [route, destination] of [
    ["/platform", "/admin"],
    ["/admin-control", "/admin"],
    ["/billing", "/payments"],
    ["/ai-copilot", "/ai-platform"],
  ]) {
    const redirect = await fetch(`${baseUrl}${route}`, {
      redirect: "manual",
      headers: { cookie: owner.jar.header() },
    });
    assert.ok([307, 308].includes(redirect.status));
    assert.equal(new URL(redirect.headers.get("location"), baseUrl).pathname, destination);
  }

  const logoutActor = await actor("logout");
  await browserRequest(logoutActor.jar, "/api/auth/login", {
    method: "POST",
    body: {
      email: logoutActor.email,
      password: logoutActor.password,
      organizationId: logoutActor.organizationId,
      deviceLabel: "logout duplicate session verification",
    },
  });
  assert.equal(
    await prisma.authSession.count({ where: { userId: logoutActor.userId, status: "ACTIVE" } }),
    1,
    "A new browser session must revoke its duplicate fingerprint.",
  );
  await browserRequest(logoutActor.jar, "/api/auth/logout", { method: "POST" });
  assert.equal(await prisma.authSession.count({ where: { userId: logoutActor.userId, status: "ACTIVE" } }), 0);
  await browserRequest(logoutActor.jar, "/api/notifications/unread-count", { expected: [401] });

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        migrations: migrations.length,
        seed: "verified",
        projectMemberPickerAndRoles: "verified",
        tenantIsolation: "verified",
        regionalCacheInvalidation: "verified",
        externalSearchFederation: "verified",
        workerBatchOptimization: "verified",
        capacityReport: "verified",
        legacyFrontendRedirects: "verified",
        logoutAndDuplicateSessions: "verified",
        contractLifecycleAndProjectLink: "verified",
        enterpriseControlCenter: "verified",
        globalSearchSixEntities: "verified",
        dependencyDagAndHealth: "verified",
        notificationLifecycleRealtime: "verified",
        liveObservability: "verified",
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
  console.error(error);
  if (nextLogs.length) console.error(nextLogs.slice(-100).join(""));
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await new Promise((resolve) => sink?.close(resolve)).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
  await socketServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}

if (failure) process.exitCode = 1;
