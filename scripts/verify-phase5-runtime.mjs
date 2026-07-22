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
const databasePort = Number(process.env.PHASE5_DATABASE_PORT ?? 55435);
const applicationPort = Number(process.env.PHASE5_APPLICATION_PORT ?? 3112);
const providerPort = Number(process.env.PHASE5_PROVIDER_PORT ?? 4121);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase5-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];
const workerSecret = `${randomUUID()}${randomUUID()}`;
const providerToken = `${randomUUID()}${randomUUID()}`;

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = value.split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator > 0) this.cookies.set(first.slice(0, separator), first.slice(separator + 1));
    }
  }
  header() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "); }
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...options.env }, stdio: options.stdio ?? ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runRequired(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(command, args, { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} failed:\n${stdout}\n${stderr}`)));
  });
}

async function waitForPort(port, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
      socket.setTimeout(300, () => { socket.destroy(); resolve(false); });
    });
    if (open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for port ${port}.`);
}

async function waitForApplication() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/auth/csrf`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application did not become ready.\n${nextLogs.slice(-30).join("")}`);
}

async function request(jar, route, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
  let token;
  if (csrf) {
    const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, { headers: jar?.header() ? { cookie: jar.header() } : {} });
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
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response);
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${method} ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, meta: envelope.meta, error: envelope.error, headers: response.headers };
}

async function runtime(input, expected = [202]) {
  const response = await fetch(`${baseUrl}/api/internal/workers/runtime`, {
    method: "POST",
    headers: { authorization: `Bearer ${workerSecret}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `runtime ${input.action}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function aiWorker(workerId, expected = [200]) {
  const response = await fetch(`${baseUrl}/api/internal/workers/ai`, { method: "POST", headers: { "x-worker-secret": workerSecret, "x-worker-id": workerId } });
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `AI worker: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase5-${label}-${randomUUID()}@example.test`;
  const password = "Phase5!Enterprise123";
  const registration = await request(jar, "/api/auth/register", { method: "POST", expected: [201], body: { email, displayName: `Phase 5 ${label}`, password } });
  await request(jar, "/api/auth/login", { method: "POST", body: { email, password, organizationId: registration.data.organizationId } });
  return { jar, email, password, userId: registration.data.id, organizationId: registration.data.organizationId };
}

async function loginToOrganization(actorRow, organizationId) {
  await request(actorRow.jar, "/api/auth/login", { method: "POST", body: { email: actorRow.email, password: actorRow.password, organizationId } });
}

class AiProviderDouble {
  server;
  failuresRemaining = 0;
  completions = 0;
  async start() {
    this.server = createServer(async (req, res) => {
      const body = await new Promise((resolve) => { const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => resolve(Buffer.concat(chunks))); });
      const reply = (status, payload) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(payload)); };
      if (req.headers.authorization !== `Bearer ${providerToken}`) return reply(401, { error: "unauthorized" });
      if (req.url === "/models" && req.method === "GET") return reply(200, { data: [{ id: "governed-model" }] });
      if (req.url === "/chat/completions" && req.method === "POST") {
        if (this.failuresRemaining > 0) { this.failuresRemaining -= 1; return reply(503, { error: "provider unavailable" }); }
        const input = JSON.parse(body.toString());
        this.completions += 1;
        return reply(200, { id: `phase5-completion-${this.completions}`, model: input.model, choices: [{ message: { content: "Governed provider response" } }], usage: { prompt_tokens: 5, completion_tokens: 7, cost_minor: 12 } });
      }
      return reply(404, { error: "not found" });
    });
    await new Promise((resolve, reject) => { this.server.once("error", reject); this.server.listen(providerPort, "127.0.0.1", resolve); });
  }
  async stop() { if (this.server) await new Promise((resolve) => this.server.close(resolve)); }
}

async function applyMigration(database, name) {
  await database.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
  process.stdout.write(`Applied migration ${name}\n`);
}

const provider = new AiProviderDouble();
let pglite;
let socketServer;
let prisma;
let failure;

try {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migration of migrations) await applyMigration(pglite, migration);
  socketServer = new PGLiteSocketServer({ db: pglite, port: databasePort, host: "127.0.0.1", maxConnections: 40 });
  await socketServer.start();
  await waitForPort(databasePort);
  await provider.start();

  const memoryShim = path.join(temporary, "memory-shim.cjs");
  await writeFile(memoryShim, `
const original=process.memoryUsage;
function empty(){return {rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0};}
function safe(){try{return original();}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return empty();throw error;}}
safe.rss=()=>{try{return original.rss();}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return 0;throw error;}};
process.memoryUsage=safe;
`, "utf8");
  const env = {
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: baseUrl,
    REDIS_URL: "redis://127.0.0.1:6395",
    AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_WORKER_SECRET: workerSecret,
    AI_PROVIDER_BASE_URL: providerUrl,
    AI_PROVIDER_API_KEY: providerToken,
    AI_PROVIDER_KEY: "phase5-ai",
    PAYMENT_PROVIDER_BASE_URL: "http://127.0.0.1:4112",
    PAYMENT_PROVIDER_API_KEY: `${randomUUID()}${randomUUID()}`,
    PAYMENT_WEBHOOK_SECRET: `${randomUUID()}${randomUUID()}`,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: prismaTemporary,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim(),
  };
  await runRequired(process.execPath, ["prisma/seed.mjs"], env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(path.join(root, "node_modules/.bin/next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)], { env });
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => { nextLogs.push(chunk.toString()); if (nextLogs.length > 300) nextLogs.shift(); });
  await waitForApplication();

  const owner = await actor("owner");
  const operator = await actor("operator");
  const outsider = await actor("outsider");
  const managerRole = await prisma.role.findFirstOrThrow({ where: { organizationId: owner.organizationId, name: "Manager" } });
  await prisma.membership.create({ data: { organizationId: owner.organizationId, userId: operator.userId, roleId: managerRole.id, status: "ACTIVE" } });
  await loginToOrganization(operator, owner.organizationId);

  await request(owner.jar, "/api/ai/config", { method: "PUT", body: { enabled: true, providerKey: "phase5-ai", defaultModel: "governed-model", dataUsagePolicy: "NO_TRAINING", humanApprovalRequired: true, monthlyTokenBudget: "100000", monthlyCostBudgetMinor: "10000", maxTokensPerRun: 1024, maxCostPerRunMinor: "100", maxInputBytes: 65536, allowedUseCases: ["project.summary"], allowedModels: ["governed-model"], allowedProviderKeys: ["phase5-ai"], settings: {} } });
  const providerStatus = await request(owner.jar, "/api/ai/providers/status");
  assert.equal(providerStatus.data.provider.status, "healthy");
  await request(owner.jar, "/api/ai/runs", { method: "POST", expected: [403], body: { useCase: "forbidden.usecase", input: { text: "blocked" }, idempotencyKey: randomUUID() } });

  const prompt = (await request(owner.jar, "/api/ai/prompts", { method: "POST", expected: [201], body: { key: "project.summary", name: "Project summary", useCase: "project.summary", systemTemplate: "Summarize only approved tenant data.", userTemplate: "Summarize {{request}}", variables: { request: "string" }, safetyPolicy: { tenantIsolation: true } } })).data;
  const version2 = (await request(owner.jar, `/api/ai/prompts/${prompt.id}/versions`, { method: "POST", expected: [201], body: { systemTemplate: "Summarize approved tenant data with concise evidence.", userTemplate: "Provide a summary for {{request}}", variables: { request: "string" }, safetyPolicy: { tenantIsolation: true }, activate: true } })).data;
  assert.equal(version2.version, 2);
  const promptHistory = await request(owner.jar, "/api/ai/prompts");
  assert.equal(promptHistory.data.find((item) => item.id === prompt.id).versions.length, 2);

  const run = (await request(owner.jar, "/api/ai/runs", { method: "POST", expected: [202], body: { useCase: "project.summary", promptKey: "project.summary", input: { request: "Phase Five" }, idempotencyKey: randomUUID() } })).data;
  assert.equal(run.status, "PENDING_APPROVAL");
  await request(operator.jar, `/api/ai/runs/${run.id}/approval`, { method: "POST", expected: [403], body: { decision: "APPROVED", note: "Operator lacks approval permission." } });
  await request(owner.jar, `/api/ai/runs/${run.id}/approval`, { method: "POST", body: { decision: "APPROVED", note: "Human evidence reviewed." } });
  provider.failuresRemaining = 1;
  await aiWorker("phase5-ai-worker", [503]);
  const aiJob = await prisma.backgroundJob.findUniqueOrThrow({ where: { deduplicationKey: `ai-run:${run.id}` } });
  assert.equal(aiJob.status, "PENDING");
  assert.equal(aiJob.attempts, 1);
  await prisma.backgroundJob.update({ where: { id: aiJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } });
  await aiWorker("phase5-ai-worker");
  const completedRun = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id }, include: { usage: true, budgetReservation: true } });
  assert.equal(completedRun.status, "COMPLETED");
  assert.equal(completedRun.usage?.inputTokens, 5);
  assert.equal(completedRun.budgetReservation?.status, "SETTLED");

  const cancellable = (await request(owner.jar, "/api/ai/runs", { method: "POST", expected: [202], body: { useCase: "project.summary", promptKey: "project.summary", input: { request: "Cancellation evidence" }, idempotencyKey: randomUUID() } })).data;
  await request(owner.jar, `/api/ai/runs/${cancellable.id}/cancel`, { method: "POST", body: { reason: "Cancelled in the runtime regression." } });
  const retried = (await request(owner.jar, `/api/ai/runs/${cancellable.id}/retry`, { method: "POST", expected: [202], body: { idempotencyKey: randomUUID() } })).data;
  assert.equal(retried.status, "PENDING_APPROVAL");
  const outsiderRuns = await request(outsider.jar, "/api/ai/runs?take=100");
  assert.ok(!outsiderRuns.data.some((item) => item.id === run.id));
  assert.ok((await request(owner.jar, "/api/ai/usage?days=30")).data.daily.length >= 1);
  assert.ok((await request(owner.jar, "/api/ai/audit?take=100")).data.items.length >= 8);

  const failureJob = await prisma.backgroundJob.create({ data: { organizationId: owner.organizationId, type: "PHASE5_FAILURE_TEST", queue: "integration", payload: { purpose: "retry-and-dead-letter" }, maxAttempts: 2 } });
  const [firstClaim, competingClaim] = await Promise.all([
    runtime({ action: "CLAIM", workerId: "lease-worker-a", queues: ["integration"], types: ["PHASE5_FAILURE_TEST"], version: "phase5-test" }),
    runtime({ action: "CLAIM", workerId: "lease-worker-b", queues: ["integration"], types: ["PHASE5_FAILURE_TEST"], version: "phase5-test" }),
  ]);
  const claim = firstClaim.data ?? competingClaim.data;
  assert.ok(claim?.leaseToken);
  assert.equal([firstClaim.data, competingClaim.data].filter(Boolean).length, 1);
  await runtime({ action: "HEARTBEAT", workerId: claim.job.lockedBy, jobId: failureJob.id, leaseToken: randomUUID(), queues: ["integration"] }, [409]);
  await runtime({ action: "HEARTBEAT", workerId: claim.job.lockedBy, jobId: failureJob.id, leaseToken: claim.leaseToken, queues: ["integration"] });
  await runtime({ action: "FAIL", workerId: claim.job.lockedBy, jobId: failureJob.id, leaseToken: claim.leaseToken, errorCode: "PROVIDER_TIMEOUT", errorMessage: "Synthetic provider timeout.", diagnostics: { stage: "first-attempt" }, queues: ["integration"] });
  assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: failureJob.id } })).status, "PENDING");
  await prisma.backgroundJob.update({ where: { id: failureJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } });
  const secondClaim = await runtime({ action: "CLAIM", workerId: "lease-worker-a", queues: ["integration"], types: ["PHASE5_FAILURE_TEST"] });
  await runtime({ action: "FAIL", workerId: "lease-worker-a", jobId: failureJob.id, leaseToken: secondClaim.data.leaseToken, errorCode: "PROVIDER_TIMEOUT", errorMessage: "Synthetic provider timeout after retry.", diagnostics: { stage: "exhausted" }, queues: ["integration"] });
  const deadLettered = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: failureJob.id }, include: { attemptHistory: true, deadLetter: true } });
  assert.equal(deadLettered.status, "DEAD_LETTER");
  assert.equal(deadLettered.attemptHistory.length, 2);
  assert.ok(deadLettered.deadLetter);

  const operatorJobs = await request(operator.jar, "/api/operations/jobs?take=100");
  assert.ok(operatorJobs.data.items.some((item) => item.id === failureJob.id));
  await request(operator.jar, `/api/operations/jobs/${failureJob.id}/recover`, { method: "POST", expected: [403], body: { reason: "Should be denied." } });
  const recoveryPath = `/api/operations/jobs/${failureJob.id}/recover`;
  let recovery = await request(owner.jar, recoveryPath, { method: "POST", expected: [200, 404], body: { reason: "Diagnostics reviewed and safe to replay." } });
  for (let compileAttempt = 1; recovery.status === 404 && !recovery.error?.code && compileAttempt <= 8; compileAttempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, compileAttempt * 500));
    recovery = await request(owner.jar, recoveryPath, { method: "POST", expected: [200, 404], body: { reason: "Diagnostics reviewed and safe to replay." } });
  }
  assert.equal(recovery.status, 200);
  assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: failureJob.id } })).status, "PENDING");
  const recoveredClaim = await runtime({ action: "CLAIM", workerId: "lease-worker-a", queues: ["integration"], types: ["PHASE5_FAILURE_TEST"] });
  await runtime({ action: "COMPLETE", workerId: "lease-worker-a", jobId: failureJob.id, leaseToken: recoveredClaim.data.leaseToken, diagnostics: { stage: "recovered" }, queues: ["integration"] });
  const recoveredJob = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: failureJob.id }, include: { attemptHistory: true, deadLetter: true } });
  assert.equal(recoveredJob.status, "COMPLETED");
  assert.equal(recoveredJob.attemptHistory.length, 3);
  assert.equal(recoveredJob.deadLetter?.recoveryCount, 1);
  const outsiderJobs = await request(outsider.jar, "/api/operations/jobs?take=100");
  assert.ok(!outsiderJobs.data.items.some((item) => item.id === failureJob.id));

  const exportJob = (await request(owner.jar, "/api/admin/data-exports", { method: "POST", expected: [202], body: { type: "ORGANIZATION", filters: {} } })).data;
  for (let index = 0; index < 5; index += 1) {
    await runtime({ action: "PROCESS", workerId: "operations-worker", queues: ["operations"] });
    const current = await prisma.dataExportJob.findUniqueOrThrow({ where: { id: exportJob.id } });
    if (current.status === "COMPLETED") break;
  }
  const completedExport = await prisma.dataExportJob.findUniqueOrThrow({ where: { id: exportJob.id }, include: { artifact: true } });
  assert.equal(completedExport.status, "COMPLETED");
  assert.ok(completedExport.artifact?.checksumSha256);
  const exportDownload = await fetch(`${baseUrl}/api/admin/data-exports/${exportJob.id}/download`, { headers: { cookie: owner.jar.header() } });
  assert.equal(exportDownload.status, 200);
  assert.equal(exportDownload.headers.get("x-content-sha256"), completedExport.artifact.checksumSha256);
  assert.equal((await exportDownload.json()).organizationId, owner.organizationId);

  const schedule = (await request(owner.jar, "/api/operations/schedules", { method: "POST", expected: [201], body: { key: `phase5-retention-${randomUUID()}`, jobType: "RETENTION_ENFORCE", queue: "operations", payload: { organizationId: owner.organizationId }, intervalSeconds: 60, priority: 100, maxAttempts: 3, enabled: true, nextRunAt: new Date(Date.now() - 1_000).toISOString() } })).data;
  await request(operator.jar, `/api/operations/schedules/${schedule.id}`, { method: "PATCH", expected: [403], body: { enabled: false } });
  await runtime({ action: "SCHEDULE", workerId: "schedule-worker", queues: ["operations"] });
  await runtime({ action: "SCHEDULE", workerId: "schedule-worker", queues: ["operations"] });
  assert.equal(await prisma.backgroundJob.count({ where: { scheduleId: schedule.id } }), 1);

  const ownerNotification = await prisma.userNotification.create({ data: { userId: owner.userId, organizationId: owner.organizationId, type: "PHASE5_SCHEDULED_DELIVERY", title: "Tenant-scoped scheduled delivery", deliveries: { create: { userId: owner.userId, channel: "IN_APP" } } } });
  const outsiderNotification = await prisma.userNotification.create({ data: { userId: outsider.userId, organizationId: outsider.organizationId, type: "PHASE5_TENANT_PROBE", title: "Must remain pending", deliveries: { create: { userId: outsider.userId, channel: "IN_APP" } } } });
  const notificationSchedule = (await request(owner.jar, "/api/operations/schedules", { method: "POST", expected: [201], body: { key: `phase5-notifications-${randomUUID()}`, jobType: "NOTIFICATION_DELIVERY", queue: "operations", payload: {}, intervalSeconds: 60, priority: 100, maxAttempts: 3, enabled: true, nextRunAt: new Date(Date.now() - 1_000).toISOString() } })).data;
  await runtime({ action: "SCHEDULE", workerId: "schedule-worker", queues: ["operations"] });
  for (let index = 0; index < 4; index += 1) {
    await runtime({ action: "PROCESS", workerId: "operations-worker", queues: ["operations"] });
    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { notificationId_channel: { notificationId: ownerNotification.id, channel: "IN_APP" } } });
    if (delivery.status === "DELIVERED") break;
  }
  assert.equal((await prisma.notificationDelivery.findUniqueOrThrow({ where: { notificationId_channel: { notificationId: ownerNotification.id, channel: "IN_APP" } } })).status, "DELIVERED");
  assert.equal((await prisma.notificationDelivery.findUniqueOrThrow({ where: { notificationId_channel: { notificationId: outsiderNotification.id, channel: "IN_APP" } } })).status, "PENDING");
  assert.equal(await prisma.backgroundJob.count({ where: { scheduleId: notificationSchedule.id } }), 1);
  assert.ok((await request(owner.jar, "/api/operations/workers")).data.some((worker) => worker.workerId === "lease-worker-a"));
  const summary = await request(owner.jar, "/api/operations/summary");
  assert.equal(summary.data.readiness.database.status, "healthy");

  console.log(JSON.stringify({
    result: "PASS",
    migrations: `${migrations.length} chronological migrations applied`,
    aiGovernance: "policy, prompt versions, human approval, denial, cancellation, retry, budget settlement, usage, audit and provider recovery verified",
    workers: "exclusive leasing, token-bound heartbeat, retry, attempt diagnostics, dead-letter and controlled recovery verified",
    administration: "permission boundaries, tenant isolation, scheduled retention and notification delivery, worker monitoring, export processing and health summary verified",
    providerFailures: "AI provider failure persisted diagnostics and recovered through bounded retry",
  }, null, 2));
} catch (error) {
  failure = error;
  console.error(error);
  console.error(nextLogs.slice(-60).join(""));
} finally {
  await prisma?.$disconnect().catch(() => undefined);
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const child of children) child.kill("SIGKILL");
  await provider.stop().catch(() => undefined);
  await socketServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}

if (failure) throw failure;
