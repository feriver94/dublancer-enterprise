import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { captureRuntimeBaseline, cleanupRuntime } from "./runtime-cleanup.mjs";

const root = process.cwd();
const runtimeBaseline = await captureRuntimeBaseline(root);
const databasePort = Number(process.env.PHASE9_DATABASE_PORT ?? 55449);
const applicationPort = Number(process.env.PHASE9_APPLICATION_PORT ?? 3119);
const sinkPort = Number(process.env.PHASE9_SINK_PORT ?? 4219);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const sinkUrl = `http://127.0.0.1:${sinkPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase9-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];
const webhookRequests = [];
const connectorRequests = [];
const internalWorkerSecret = `${randomUUID()}${randomUUID()}`;

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
  header() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
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
      code === 0 ? resolve() : reject(new Error(`${command} failed:\n${output}`)),
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
  throw new Error(`Application did not become ready.\n${nextLogs.slice(-60).join("")}`);
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
  const email = `phase9-${label}-${randomUUID()}@example.test`;
  const password = "Phase9!Enterprise123";
  const registration = await browserRequest(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase 9 ${label}`, password },
  });
  await browserRequest(jar, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      organizationId: registration.data.organizationId,
      deviceLabel: `${label} workstation`,
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
      deviceLabel: "Phase 9 tenant workstation",
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
  let flakyAttempts = 0;
  sink = createServer((request, response) => {
    void (async () => {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      if (request.url === "/connector") {
        connectorRequests.push({ body: raw ? JSON.parse(raw) : null });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: true, records: 1 }));
        return;
      }
      if (request.url === "/flaky") {
        webhookRequests.push({
          body: raw ? JSON.parse(raw) : null,
          signature: request.headers["x-dublancer-signature-256"],
          eventId: request.headers["x-dublancer-event-id"],
        });
        flakyAttempts += 1;
        if (flakyAttempts === 1) {
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ retry: true }));
          return;
        }
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: true }));
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
    INTEGRATION_ALLOW_PRIVATE_NETWORK: "true",
    INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_EMAIL_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_WORKER_SECRET: internalWorkerSecret,
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
  const [ownerMembership, ownerRole, viewerRole] = await Promise.all([
    prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: owner.userId,
          organizationId: owner.organizationId,
        },
      },
    }),
    prisma.role.findFirstOrThrow({
      where: { organizationId: owner.organizationId, name: "Owner" },
    }),
    prisma.role.findFirstOrThrow({
      where: { organizationId: owner.organizationId, name: "Viewer" },
    }),
  ]);
  const reviewerMembership = await prisma.membership.create({
    data: {
      userId: outsider.userId,
      organizationId: owner.organizationId,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  const reviewerJar = await login(outsider, owner.organizationId);

  const pipeline = (
    await browserRequest(owner.jar, "/api/crm/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "pipeline.create",
        name: `Enterprise pipeline ${randomUUID().slice(0, 8)}`,
        isDefault: true,
        stages: [
          { name: "Qualified", probability: 35, category: "OPEN" },
          { name: "Proposal", probability: 70, category: "OPEN" },
          { name: "Won", probability: 100, category: "WON" },
          { name: "Lost", probability: 0, category: "LOST" },
        ],
      },
    })
  ).data;
  const lead = (
    await browserRequest(owner.jar, "/api/crm/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "lead.create",
        firstName: "Mariam",
        lastName: "Al Mansoori",
        email: `mariam-${randomUUID()}@customer.test`,
        companyName: "Phase 9 Customer",
        source: "enterprise-referral",
        score: 88,
        assignedToMembershipId: ownerMembership.id,
      },
    })
  ).data;
  const converted = (
    await browserRequest(owner.jar, "/api/crm/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "lead.convert",
        leadId: lead.id,
        accountName: `Phase 9 Customer ${randomUUID().slice(0, 8)}`,
        opportunityName: "Enterprise platform expansion",
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        amountMinor: 250000,
        currency: "AED",
      },
    })
  ).data;
  await browserRequest(owner.jar, "/api/crm/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "activity.create",
      type: "MEETING",
      subject: "Discovery workshop",
      accountId: converted.account.id,
      opportunityId: converted.opportunity.id,
    },
  });
  await browserRequest(owner.jar, "/api/crm/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "note.create",
      body: "Customer requires governed bilingual delivery.",
      isPinned: true,
      accountId: converted.account.id,
    },
  });
  const quote = (
    await browserRequest(owner.jar, "/api/crm/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "quote.create",
        opportunityId: converted.opportunity.id,
        contactId: converted.contact.id,
        currency: "AED",
        discountMinor: 10000,
        taxMinor: 12000,
        lines: [
          {
            description: "Enterprise delivery",
            quantity: 1,
            unitPriceMinor: 250000,
          },
        ],
      },
    })
  ).data;
  const sent = (
    await browserRequest(owner.jar, "/api/crm/overview", {
      method: "POST",
      body: {
        action: "quote.transition",
        quoteId: quote.id,
        status: "SENT",
        expectedVersion: 1,
      },
    })
  ).data;
  await browserRequest(owner.jar, "/api/crm/overview", {
    method: "POST",
    body: {
      action: "quote.transition",
      quoteId: quote.id,
      status: "ACCEPTED",
      expectedVersion: sent.version,
    },
  });
  await browserRequest(owner.jar, "/api/crm/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "health.capture",
      accountId: converted.account.id,
      score: 91,
      signals: { engagement: "high", renewalRisk: "low" },
      source: "phase9-runtime",
    },
  });
  await browserRequest(owner.jar, "/api/crm/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "metric.record",
      accountId: converted.account.id,
      key: "adoption.active_users",
      value: 42,
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
    },
  });
  const timeline = await browserRequest(
    owner.jar,
    `/api/crm/accounts/${converted.account.id}/timeline`,
  );
  assert.ok(timeline.data.timeline.length >= 4);
  await browserRequest(
    outsider.jar,
    `/api/crm/accounts/${converted.account.id}/timeline`,
    { expected: [404] },
  );

  const profile = (
    await browserRequest(owner.jar, "/api/talent/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "profile.upsert",
        membershipId: ownerMembership.id,
        title: "Enterprise Delivery Lead",
        status: "ACTIVE",
        timezone: "Asia/Dubai",
        currency: "AED",
        targetUtilizationPercent: 80,
      },
    })
  ).data;
  const skill = await prisma.skill.findFirstOrThrow({ where: { slug: "nextjs" } });
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "skill.upsert",
      talentProfileId: profile.id,
      skillId: skill.id,
      proficiency: "EXPERT",
      yearsExperience: 8,
      verified: true,
    },
  });
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "certification.create",
      talentProfileId: profile.id,
      name: "Enterprise Architecture",
      issuer: "Dublancer Academy",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2028-01-01T00:00:00.000Z",
    },
  });
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "availability.create",
      talentProfileId: profile.id,
      status: "AVAILABLE",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-31T00:00:00.000Z",
      capacityPercent: 100,
    },
  });
  const plan = (
    await browserRequest(owner.jar, "/api/talent/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "plan.create",
        name: `Phase 9 capacity ${randomUUID().slice(0, 8)}`,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-12-31T00:00:00.000Z",
        budgetHours: 800,
        activate: true,
      },
    })
  ).data;
  const requirement = (
    await browserRequest(owner.jar, "/api/talent/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "requirement.create",
        resourcePlanId: plan.id,
        skillId: skill.id,
        roleTitle: "Delivery Lead",
        requiredProfiles: 1,
        hoursPerWeek: 40,
        minProficiency: "ADVANCED",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-12-31T00:00:00.000Z",
      },
    })
  ).data;
  const bench = (
    await browserRequest(owner.jar, "/api/talent/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "bench.enter",
        talentProfileId: profile.id,
        reason: "Awaiting Phase 9 assignment",
      },
    })
  ).data;
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "staffing.assign",
      resourcePlanId: plan.id,
      requirementId: requirement.id,
      talentProfileId: profile.id,
      allocationPercent: 80,
      hoursPerWeek: 32,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-31T00:00:00.000Z",
      activate: true,
    },
  });
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "capacity.capture",
      talentProfileId: profile.id,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-09-01T00:00:00.000Z",
      availableHours: 160,
      allocatedHours: 128,
    },
  });
  await browserRequest(owner.jar, "/api/talent/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "performance.record",
      talentProfileId: profile.id,
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-07-01T00:00:00.000Z",
      rating: "EXCEEDS_EXPECTATIONS",
      utilizationPercent: 82,
      deliveryScore: 94,
      feedback: "Strong enterprise delivery outcomes.",
    },
  });
  assert.equal(
    (await prisma.talentBenchEntry.findUniqueOrThrow({ where: { id: bench.id } })).status,
    "PARTIALLY_ALLOCATED",
  );

  const category = (
    await browserRequest(owner.jar, "/api/knowledge/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "category.create",
        name: "Enterprise Operations",
        slug: `enterprise-operations-${randomUUID().slice(0, 8)}`,
      },
    })
  ).data;
  const article = (
    await browserRequest(owner.jar, "/api/knowledge/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "article.create",
        categoryId: category.id,
        slug: `phase9-operating-guide-${randomUUID().slice(0, 8)}`,
        title: "Phase 9 customer operating guide",
        summary: "Approved customer and workforce operating controls.",
        body: "Customer health is captured from adoption, engagement and renewal risk. Staffing must never exceed one hundred percent capacity.",
        locale: "en-AE",
        isInternal: true,
      },
    })
  ).data;
  const submitted = (
    await browserRequest(owner.jar, "/api/knowledge/overview", {
      method: "POST",
      body: {
        action: "article.submit",
        articleId: article.id,
        reviewerIds: [outsider.userId],
      },
    })
  ).data;
  const approval = submitted.approvals.find(
    (row) => row.reviewerId === outsider.userId,
  );
  assert.ok(approval);
  const approvalResult = await browserRequest(
    reviewerJar,
    "/api/knowledge/overview",
    {
      method: "POST",
      body: {
        action: "approval.decide",
        approvalId: approval.id,
        decision: "APPROVED",
        comment: "Evidence reviewed.",
      },
    },
  );
  assert.equal(approvalResult.data.articleStatus, "APPROVED");
  await browserRequest(owner.jar, "/api/knowledge/overview", {
    method: "POST",
    body: { action: "article.publish", articleId: article.id },
  });
  await browserRequest(owner.jar, "/api/knowledge/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "faq.upsert",
      question: "How is customer health classified?",
      answer: "Health is classified from a durable score and governed signals.",
      locale: "en-AE",
      publish: true,
      sortOrder: 1,
    },
  });
  const retrieval = await browserRequest(owner.jar, "/api/knowledge/retrieve", {
    method: "POST",
    body: { query: "customer health renewal risk", take: 5, aiAssist: false },
  });
  assert.equal(retrieval.data.sources[0].articleId, article.id);
  const indexed = await browserRequest(
    owner.jar,
    "/api/search?q=customer%20health&entityType=knowledge_article",
  );
  assert.ok(indexed.data.some((item) => item.entityId === article.id));
  await prisma.aiTenantConfig.upsert({
    where: { organizationId: owner.organizationId },
    create: {
      organizationId: owner.organizationId,
      enabled: true,
      defaultModel: "phase9-test-model",
      humanApprovalRequired: false,
      maxTokensPerRun: 256,
      allowedUseCases: ["knowledge.retrieval"],
      allowedModels: ["phase9-test-model"],
    },
    update: {
      enabled: true,
      defaultModel: "phase9-test-model",
      humanApprovalRequired: false,
      maxTokensPerRun: 256,
      allowedUseCases: ["knowledge.retrieval"],
      allowedModels: ["phase9-test-model"],
    },
  });
  const aiRetrieval = await browserRequest(owner.jar, "/api/knowledge/retrieve", {
    method: "POST",
    body: {
      query: "staffing capacity",
      take: 5,
      aiAssist: true,
      idempotencyKey: `phase9-knowledge-${randomUUID()}`,
    },
  });
  assert.equal(aiRetrieval.data.mode, "GOVERNED_AI_PENDING");
  assert.equal(aiRetrieval.data.aiRun.status, "QUEUED");

  const connector = (
    await browserRequest(owner.jar, "/api/integrations/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "connector.create",
        name: "Phase 9 REST connector",
        key: `phase9.connector.${randomUUID().slice(0, 8)}`,
        type: "EXPORT",
        baseUrl: sinkUrl,
        method: "POST",
        path: "/connector",
        authType: "NONE",
        activate: true,
      },
    })
  ).data;
  const run = await browserRequest(owner.jar, "/api/integrations/overview", {
    method: "POST",
    expected: [202],
    body: {
      action: "connector.execute",
      connectorId: connector.id,
      idempotencyKey: `phase9-run-${randomUUID()}`,
      payload: { records: [{ id: "account-1" }] },
    },
  });
  assert.equal(run.data.status, "SUCCEEDED");
  assert.equal(connectorRequests.length, 1);
  const apiKey = (
    await browserRequest(owner.jar, "/api/integrations/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "apiKey.create",
        name: "Phase 9 event publisher",
        scopes: ["events.publish", "connectors.execute", "monitoring.read"],
      },
    })
  ).data;
  assert.match(apiKey.secret, /^dpk_/);
  const webhook = (
    await browserRequest(owner.jar, "/api/integrations/overview", {
      method: "POST",
      expected: [201],
      body: {
        action: "webhook.create",
        name: "Phase 9 retry sink",
        url: `${sinkUrl}/flaky`,
        eventTypes: ["crm.account.updated"],
        maxAttempts: 3,
        timeoutMs: 5_000,
      },
    })
  ).data;
  await browserRequest(owner.jar, "/api/integrations/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "subscription.create",
      endpointId: webhook.endpoint.id,
      eventType: "crm.account.updated",
    },
  });
  const externalResponse = await fetch(`${baseUrl}/api/integrations/rest/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey.secret}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      eventType: "crm.account.updated",
      aggregateType: "CrmAccount",
      aggregateId: converted.account.id,
      payload: { healthScore: 91 },
      correlationId: `phase9-${randomUUID()}`,
    }),
  });
  assert.equal(externalResponse.status, 202);
  const externalEvent = (await externalResponse.json()).data.event;
  const firstDelivery = await browserRequest(
    null,
    "/api/internal/integrations/process",
    {
      method: "POST",
      csrf: false,
      expected: [202],
      headers: { authorization: `Bearer ${internalWorkerSecret}` },
      body: { action: "PROCESS_DELIVERIES", limit: 20 },
    },
  );
  assert.equal(firstDelivery.data.results[0].status, "RETRYING");
  const delivery = await prisma.integrationWebhookDelivery.findFirstOrThrow({
    where: { eventId: externalEvent.id },
  });
  await prisma.integrationWebhookDelivery.update({
    where: { id: delivery.id },
    data: { nextAttemptAt: new Date() },
  });
  const secondDelivery = await browserRequest(
    null,
    "/api/internal/integrations/process",
    {
      method: "POST",
      csrf: false,
      expected: [202],
      headers: { authorization: `Bearer ${internalWorkerSecret}` },
      body: { action: "PROCESS_DELIVERIES", limit: 20 },
    },
  );
  assert.equal(secondDelivery.data.results[0].status, "SUCCEEDED");
  assert.equal(webhookRequests.length, 2);
  assert.match(webhookRequests[1].signature, /^sha256=[a-f0-9]{64}$/);
  await browserRequest(owner.jar, "/api/integrations/overview", {
    method: "POST",
    expected: [201],
    body: {
      action: "oauth.upsert",
      connectorId: connector.id,
      provider: "phase9-provider",
      name: "Phase 9 OAuth",
      clientId: "phase9-client",
      clientSecret: `${randomUUID()}${randomUUID()}`,
      scopes: ["read", "write"],
      accessToken: `${randomUUID()}${randomUUID()}`,
      refreshToken: `${randomUUID()}${randomUUID()}`,
      tokenExpiresAt: "2027-01-01T00:00:00.000Z",
    },
  });
  const storedOauth = await prisma.oAuthIntegration.findFirstOrThrow({
    where: { organizationId: owner.organizationId },
  });
  assert.match(storedOauth.accessTokenEncrypted, /^v1\./);
  assert.doesNotMatch(storedOauth.accessTokenEncrypted, /phase9-client/);
  const invalidApiKey = await fetch(`${baseUrl}/api/integrations/rest/events`, {
    method: "POST",
    headers: {
      authorization: "Bearer dpk_000000000000.invalidinvalidinvalidinvalidinvalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventType: "crm.account.updated",
      aggregateType: "CrmAccount",
      aggregateId: "invalid",
      payload: {},
    }),
  });
  assert.equal(invalidApiKey.status, 401);

  await prisma.membership.update({
    where: { id: reviewerMembership.id },
    data: { roleId: viewerRole.id },
  });
  await browserRequest(reviewerJar, "/api/crm/overview");
  await browserRequest(reviewerJar, "/api/crm/overview", {
    method: "POST",
    expected: [403],
    body: {
      action: "account.create",
      name: `Forbidden account ${randomUUID()}`,
      countryCode: "AE",
    },
  });

  for (const route of [
    "/api/crm/overview",
    "/api/talent/overview",
    "/api/knowledge/overview",
    "/api/integrations/overview",
  ]) {
    const started = performance.now();
    await browserRequest(owner.jar, route);
    assert.ok(
      performance.now() - started < 8_000,
      `${route} exceeded the 8 second regression threshold`,
    );
  }
  const profiles = await prisma.performanceProfile.findMany({
    where: {
      organizationId: owner.organizationId,
      operation: {
        in: [
          "phase9.crm.dashboard",
          "phase9.talent.dashboard",
          "phase9.knowledge.dashboard",
          "phase9.integrations.dashboard",
        ],
      },
      status: "COMPLETED",
    },
  });
  assert.ok(profiles.length >= 4);
  assert.ok(profiles.every((profile) => profile.durationMs < 5_000));

  const finalCrm = await browserRequest(owner.jar, "/api/crm/overview");
  const finalTalent = await browserRequest(owner.jar, "/api/talent/overview");
  const finalKnowledge = await browserRequest(owner.jar, "/api/knowledge/overview");
  const finalIntegrations = await browserRequest(owner.jar, "/api/integrations/overview");
  assert.equal(finalCrm.data.accounts.length, 1);
  assert.equal(finalTalent.data.profiles.length, 1);
  assert.equal(finalKnowledge.data.analytics.publishedArticles, 1);
  assert.ok(finalIntegrations.data.deliveries.some((row) => row.status === "SUCCEEDED"));

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        migrations: migrations.length,
        crmWorkflow: "verified",
        customerTimelineHealthAnalytics: "verified",
        talentSkillsStaffingCapacityBenchPerformance: "verified",
        knowledgeVersionApprovalSearchAiRetrieval: "verified",
        restApiKeysOAuthWebhooksConnectors: "verified",
        retryRecoveryAndMonitoring: "verified",
        tenantIsolation: "verified",
        permissionEnforcement: "verified",
        performanceRegression: "verified",
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
  try {
    await cleanupRuntime({
      root, baseline: runtimeBaseline, children,
      close: [
        () => sink ? new Promise((resolve) => sink.close(resolve)) : Promise.resolve(),
        () => prisma?.$disconnect(), () => socketServer?.stop(), () => pglite?.close(),
      ],
      paths: [temporary, path.join(root, ".next")],
    });
  } catch (error) { failure ??= error; console.error(error); }
}
if (failure) process.exitCode = 1;
