import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const databasePort = Number(process.env.PHASE7_DATABASE_PORT ?? 55437);
const applicationPort = Number(process.env.PHASE7_APPLICATION_PORT ?? 3114);
const providerPort = Number(process.env.PHASE7_PROVIDER_PORT ?? 4217);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase7-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];
const internalEmailSecret = `${randomUUID()}${randomUUID()}`;

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = value.split(";", 1)[0];
      const index = first.indexOf("=");
      if (index > 0) this.cookies.set(first.slice(0, index), first.slice(index + 1));
    }
  }
  header(extra) {
    return [...this.cookies, ...(extra ? Object.entries(extra) : [])]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runRequired(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(command, args, { env });
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
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/auth/csrf`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application did not become ready.\n${nextLogs.slice(-40).join("")}`);
}

async function request(
  jar,
  route,
  {
    method = "GET",
    body,
    expected = [200],
    csrf = method !== "GET",
    headers = {},
  } = {},
) {
  let token;
  if (csrf) {
    const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: jar?.header() ? { cookie: jar.header() } : {},
    });
    jar?.absorb(bootstrap);
    const envelope = await bootstrap.json();
    assert.equal(bootstrap.status, 200);
    token = envelope.data.csrfToken;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    redirect: "manual",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { "x-csrf-token": token } : {}),
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
  const email = `phase7-${label}-${randomUUID()}@example.test`;
  const password = "Phase7!Enterprise123";
  const registration = await request(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase 7 ${label}`, password },
  });
  await request(jar, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      organizationId: registration.data.organizationId,
      deviceLabel: `${label} workstation`,
    },
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  return {
    jar,
    email,
    password,
    userId: registration.data.id,
    organizationId: registration.data.organizationId,
  };
}

async function loginToOrganization(row, organizationId) {
  await request(row.jar, "/api/auth/login", {
    method: "POST",
    body: {
      email: row.email,
      password: row.password,
      organizationId,
      deviceLabel: "organization workstation",
    },
    headers: { "x-forwarded-for": "203.0.113.11" },
  });
}

let pglite;
let socketServer;
let prisma;
let provider;
let failure;
try {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (
    await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    await pglite.exec(
      await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"),
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

  provider = createServer((request_, response) => {
    if (request_.method !== "POST" || request_.url !== "/v1/deliveries") {
      response.writeHead(404).end();
      return;
    }
    let raw = "";
    request_.on("data", (chunk) => { raw += chunk; });
    request_.on("end", () => {
      JSON.parse(raw);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        providerReference: `phase7-${request_.headers["idempotency-key"]}`,
      }));
    });
  });
  await new Promise((resolve) => provider.listen(providerPort, "127.0.0.1", resolve));

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
    INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_EMAIL_SECRET: internalEmailSecret,
    INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_WORKER_SECRET: `${randomUUID()}${randomUUID()}`,
    NOTIFICATION_PROVIDER_BASE_URL: `http://127.0.0.1:${providerPort}`,
    NOTIFICATION_PROVIDER_API_KEY: `${randomUUID()}${randomUUID()}`,
    EXPOSE_DEVELOPMENT_TOKENS: "true",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: prismaTemporary,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim(),
  };
  await runRequired(process.execPath, ["prisma/seed.mjs"], env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(
    path.join(root, "node_modules/.bin/next"),
    ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)],
    { env },
  );
  for (const stream of [next.stdout, next.stderr]) {
    stream.on("data", (chunk) => {
      nextLogs.push(chunk.toString());
      if (nextLogs.length > 400) nextLogs.shift();
    });
  }
  await waitForApplication();

  const owner = await actor("owner");
  const member = await actor("member");
  const outsider = await actor("outsider");
  const starter = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: "STARTER" },
    include: { usageQuotas: true },
  });
  await prisma.planUsageQuota.update({
    where: { planId_unit: { planId: starter.id, unit: "ACTIVE_USER" } },
    data: { limit: BigInt(2) },
  });

  let subscription = (
    await request(owner.jar, "/api/billing/subscription/lifecycle")
  ).data;
  assert.equal(subscription.subscription.status, "TRIALING");
  assert.equal(subscription.activeSeats, 1);
  subscription = (
    await request(owner.jar, "/api/billing/subscription/lifecycle", {
      method: "POST",
      body: {
        action: "SUSPEND",
        reason: "Runtime administration review.",
        expectedVersion: subscription.subscription.version,
      },
    })
  ).data;
  assert.equal(subscription.status, "SUSPENDED");
  subscription = (
    await request(owner.jar, "/api/billing/subscription/lifecycle", {
      method: "POST",
      body: { action: "REACTIVATE", expectedVersion: subscription.version },
    })
  ).data;
  assert.equal(subscription.status, "ACTIVE");

  const memberRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: owner.organizationId, name: "Member" },
  });
  const managerRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: owner.organizationId, name: "Manager" },
  });
  const invitations = (
    await request(
      owner.jar,
      `/api/organizations/${owner.organizationId}/invitations/bulk`,
      {
        method: "POST",
        expected: [201],
        body: {
          invitations: [
            { email: member.email, roleId: memberRole.id, expiresInHours: 24 },
          ],
        },
      },
    )
  ).data;
  assert.equal(invitations.count, 1);
  const invitationToken = invitations.developmentTokens[0].token;
  await request(member.jar, "/api/invitations/accept", {
    method: "POST",
    body: { token: invitationToken },
  });
  await loginToOrganization(member, owner.organizationId);
  const seatDashboard = await request(
    owner.jar,
    "/api/billing/subscription/lifecycle",
  );
  assert.equal(seatDashboard.data.activeSeats, 2);
  await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/invitations/bulk`,
    {
      method: "POST",
      expected: [409],
      body: {
        invitations: [
          {
            email: `phase7-seat-overflow-${randomUUID()}@example.test`,
            roleId: memberRole.id,
            expiresInHours: 24,
          },
        ],
      },
    },
  );
  const memberMembership = await prisma.membership.findFirstOrThrow({
    where: { organizationId: owner.organizationId, userId: member.userId },
  });
  await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/members/bulk-role`,
    {
      method: "PATCH",
      body: { membershipIds: [memberMembership.id], roleId: managerRole.id },
    },
  );

  const department = (
    await request(
      owner.jar,
      `/api/organizations/${owner.organizationId}/administration`,
      {
        method: "POST",
        expected: [201],
        body: { action: "department.create", name: "Engineering" },
      },
    )
  ).data;
  await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/administration`,
    {
      method: "POST",
      expected: [201],
      body: {
        action: "team.create",
        name: "Platform",
        departmentId: department.id,
        managerMembershipId: memberMembership.id,
        membershipIds: [memberMembership.id],
      },
    },
  );
  await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/administration`,
    { method: "POST", expected: [201], body: { action: "permissionAudit.run" } },
  );
  const review = (
    await request(
      owner.jar,
      `/api/organizations/${owner.organizationId}/administration`,
      {
        method: "POST",
        expected: [201],
        body: { action: "accessReview.create", title: "Quarterly access review" },
      },
    )
  ).data;
  for (const item of review.items) {
    await request(
      owner.jar,
      `/api/organizations/${owner.organizationId}/administration`,
      {
        method: "POST",
        body: {
          action: "accessReview.decide",
          reviewId: review.id,
          itemId: item.id,
          decision: "RETAIN",
          note: "Access remains appropriate.",
        },
      },
    );
  }
  const completedReview = await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/administration`,
    {
      method: "POST",
      body: { action: "accessReview.complete", reviewId: review.id },
    },
  );
  assert.equal(completedReview.data.status, "COMPLETED");
  await request(
    outsider.jar,
    `/api/organizations/${owner.organizationId}/administration`,
    { expected: [403] },
  );

  const reset = await request(member.jar, "/api/auth/password-reset/request", {
    method: "POST",
    expected: [202],
    body: { email: member.email },
  });
  assert.equal(reset.data.accepted, true);
  const processed = await request(null, "/api/internal/email/process", {
    method: "POST",
    csrf: false,
    body: { batchSize: 100 },
    headers: { "x-internal-email-secret": internalEmailSecret },
  });
  assert.ok(processed.data.some((item) => item.delivered));
  const resetMessage = await prisma.emailMessage.findFirstOrThrow({
    where: { userId: member.userId, templateKey: "password-reset" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(resetMessage.status, "DELIVERED");
  await request(null, "/api/internal/email/process", {
    method: "PUT",
    csrf: false,
    body: {
      providerRef: resetMessage.providerRef,
      providerEventId: `bounce-${randomUUID()}`,
      event: "HARD_BOUNCE",
      reason: "Mailbox unavailable.",
      occurredAt: new Date().toISOString(),
    },
    headers: { "x-internal-email-secret": internalEmailSecret },
  });
  assert.equal(
    (await prisma.emailMessage.findUniqueOrThrow({ where: { id: resetMessage.id } })).status,
    "BOUNCED",
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(new CookieJar(), "/api/auth/login", {
      method: "POST",
      expected: [401],
      body: {
        email: member.email,
        password: "Wrong!Enterprise123",
        organizationId: owner.organizationId,
        deviceLabel: "suspicious device",
      },
      headers: { "x-forwarded-for": "198.51.100.77" },
    });
  }
  await request(new CookieJar(), "/api/auth/login", {
    method: "POST",
    expected: [429],
    body: {
      email: member.email,
      password: member.password,
      organizationId: owner.organizationId,
      deviceLabel: "suspicious device",
    },
    headers: { "x-forwarded-for": "198.51.100.77" },
  });
  const security = await request(owner.jar, "/api/security/administration");
  const activeLock = security.data.locks.find(
    (item) => item.user.email === member.email && item.status === "ACTIVE",
  );
  assert.ok(activeLock);
  assert.ok(
    security.data.decisions.some(
      (item) => item.userId === member.userId && item.action === "LOCK",
    ),
  );
  await request(owner.jar, "/api/security/administration", {
    method: "POST",
    body: {
      action: "RELEASE_LOCK",
      id: activeLock.id,
      note: "Administrative identity review completed.",
    },
  });

  const administration = await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/administration`,
  );
  assert.equal(administration.data.departments.length, 1);
  assert.equal(administration.data.teams.length, 1);
  assert.equal(administration.data.permissionAudits.length, 1);
  const emailHistory = await request(
    owner.jar,
    `/api/organizations/${owner.organizationId}/email-operations`,
  );
  assert.ok(emailHistory.data.length >= 1);

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        migrations: migrations.length,
        subscriptionLifecycle: "verified",
        seatManagement: "verified",
        memberAdministration: "verified",
        accessReview: "verified",
        emailDeliveryRetryBounceAudit: "verified",
        adaptiveAbuseLockReview: "verified",
        tenantIsolation: "verified",
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await new Promise((resolve) => provider?.close(resolve)).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
  await socketServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}
if (failure) process.exitCode = 1;
