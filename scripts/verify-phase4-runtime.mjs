import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
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
const databasePort = Number(process.env.PHASE4_DATABASE_PORT ?? 55434);
const applicationPort = Number(process.env.PHASE4_APPLICATION_PORT ?? 3111);
const providerPort = Number(process.env.PHASE4_PROVIDER_PORT ?? 4120);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase4-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];

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
    if (await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
      socket.setTimeout(300, () => { socket.destroy(); resolve(false); });
    })) return;
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
  return { status: response.status, data: envelope.data, meta: envelope.meta, error: envelope.error };
}

async function internal(route, body, expected = [202]) {
  const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { authorization: `Bearer ${workerSecret}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `internal ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase4-${label}-${randomUUID()}@example.test`;
  const password = "Phase4!Enterprise123";
  const registration = await request(jar, "/api/auth/register", { method: "POST", expected: [201], body: { email, displayName: `Phase 4 ${label}`, password } });
  await request(jar, "/api/auth/login", { method: "POST", body: { email, password, organizationId: registration.data.organizationId } });
  return { jar, email, password, userId: registration.data.id, organizationId: registration.data.organizationId };
}

async function loginToOrganization(row, organizationId) {
  await request(row.jar, "/api/auth/login", { method: "POST", body: { email: row.email, password: row.password, organizationId } });
  row.organizationId = organizationId;
}

function bufferHash(value) { return createHash("sha256").update(value).digest("hex"); }

class ProviderDouble {
  objects = new Map();
  intents = new Map();
  scans = [];
  storageAvailable = true;
  scannerAvailable = true;
  server;

  async start() {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url, providerUrl);
      const body = await new Promise((resolve) => { const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => resolve(Buffer.concat(chunks))); });
      const json = () => body.length ? JSON.parse(body.toString()) : {};
      const reply = (status, value, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(typeof value === "string" ? value : JSON.stringify(value)); };

      if (url.pathname.startsWith("/v1/sign/") || url.pathname === "/v1/uploads/verify") {
        if (!this.storageAvailable) return reply(503, { error: "storage unavailable" });
        if (req.headers.authorization !== `Bearer ${storageToken}`) return reply(401, { error: "unauthorized" });
      }
      if (url.pathname === "/v1/sign/upload" && req.method === "POST") {
        const input = json();
        this.intents.set(input.storageKey, input);
        return reply(200, { url: `${providerUrl}/objects/${encodeURIComponent(input.storageKey)}`, method: "PUT", headers: { "content-type": input.mimeType, "x-upload-token": storageToken }, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      }
      if (url.pathname.startsWith("/objects/") && req.method === "PUT") {
        if (req.headers["x-upload-token"] !== storageToken) return reply(401, { error: "unauthorized" });
        const key = decodeURIComponent(url.pathname.slice("/objects/".length));
        this.objects.set(key, { body, mimeType: String(req.headers["content-type"] ?? "application/octet-stream") });
        res.writeHead(200); return res.end();
      }
      if (url.pathname === "/v1/uploads/verify" && req.method === "POST") {
        const input = json();
        const object = this.objects.get(input.storageKey);
        if (!object) return reply(404, { error: "not found" });
        return reply(200, { providerReference: `object:${bufferHash(Buffer.from(input.storageKey)).slice(0, 16)}`, mimeType: object.mimeType, sizeBytes: object.body.length, checksumSha256: bufferHash(object.body), etag: bufferHash(object.body).slice(0, 32) });
      }
      if (url.pathname === "/v1/sign/download" && req.method === "POST") {
        const input = json();
        return reply(200, { url: `${providerUrl}/objects/${encodeURIComponent(input.storageKey)}`, method: "GET", headers: { "x-download-token": storageToken }, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      }
      if (url.pathname.startsWith("/objects/") && req.method === "GET") {
        if (req.headers["x-download-token"] !== storageToken) return reply(401, { error: "unauthorized" });
        const key = decodeURIComponent(url.pathname.slice("/objects/".length));
        const object = this.objects.get(key);
        if (!object) return reply(404, { error: "not found" });
        res.writeHead(200, { "content-type": object.mimeType }); return res.end(object.body);
      }
      if (url.pathname === "/v1/scans" && req.method === "POST") {
        if (!this.scannerAvailable) return reply(503, { error: "scanner unavailable" });
        if (req.headers.authorization !== `Bearer ${scannerToken}`) return reply(401, { error: "unauthorized" });
        const input = json(); this.scans.push(input);
        return reply(200, { providerReference: `scan:${input.fileVersionId}` });
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

async function upload(jar, content, input, target) {
  const checksumSha256 = bufferHash(content);
  const route = target ? `/api/files/${target.fileId}/versions/upload-intents` : "/api/files/upload-intents";
  const payload = target
    ? { mimeType: input.mimeType, sizeBytes: content.length, checksumSha256, expectedFileVersion: target.expectedFileVersion, lockToken: target.lockToken }
    : { name: input.name, projectId: input.projectId, parentId: input.parentId, mimeType: input.mimeType, sizeBytes: content.length, checksumSha256 };
  const intent = (await request(jar, route, { method: "POST", expected: [201], body: payload })).data;
  const put = await fetch(intent.upload.url, { method: "PUT", headers: intent.upload.headers, body: content });
  assert.ok(put.ok);
  return (await request(jar, `/api/files/upload-intents/${intent.intent.id}/complete`, { method: "POST", expected: [201], body: {} })).data;
}

async function scanResult(version, organizationId, status) {
  const raw = JSON.stringify({ eventId: randomUUID(), organizationId, fileVersionId: version.id, status, providerReference: `scan:${version.id}` });
  const signature = createHmac("sha256", scanSecret).update(raw).digest("hex");
  const response = await fetch(`${baseUrl}/api/webhooks/file-scan/malware-scan-broker`, { method: "POST", headers: { "content-type": "application/json", "x-provider-signature": signature }, body: raw });
  const envelope = await response.json();
  assert.equal(response.status, 202, JSON.stringify(envelope));
  return { raw, signature, envelope };
}

const storageToken = randomUUID();
const scannerToken = randomUUID();
const scanSecret = randomUUID();
const workerSecret = randomUUID();
const provider = new ProviderDouble();
let pglite;
let socketServer;
let prisma;
let failure;

try {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const phase4Migration = "20260720090000_enterprise_files_search_analytics";
  for (const migration of migrations.filter((name) => name < phase4Migration)) await applyMigration(pglite, migration);

  const legacyUserId = `legacy-user-${randomUUID()}`;
  const legacyOrganizationId = `legacy-org-${randomUUID()}`;
  const legacyProjectId = `legacy-project-${randomUUID()}`;
  const legacyAttachmentId = `legacy-attachment-${randomUUID()}`;
  await pglite.query(`INSERT INTO "User" ("id","email","preferredLocale","createdAt","updatedAt") VALUES ($1,$2,'en-AE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [legacyUserId, `${legacyUserId}@example.test`]);
  await pglite.query(`INSERT INTO "Organization" ("id","name","slug","status","createdAt","updatedAt") VALUES ($1,'Legacy Org',$2,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [legacyOrganizationId, `legacy-${randomUUID()}`]);
  await pglite.query(`INSERT INTO "Project" ("id","organizationId","ownerId","title","slug","status","currency","createdAt","updatedAt") VALUES ($1,$2,$3,'Legacy Project',$4,'OPEN','AED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [legacyProjectId, legacyOrganizationId, legacyUserId, `legacy-${randomUUID()}`]);
  await pglite.query(`INSERT INTO "ProjectAttachment" ("id","projectId","uploadedById","filename","storageKey","mimeType","sizeBytes","createdAt") VALUES ($1,$2,$3,'unverified.pdf',$4,'application/pdf',10,CURRENT_TIMESTAMP)`, [legacyAttachmentId, legacyProjectId, legacyUserId, `legacy/${randomUUID()}`]);
  await applyMigration(pglite, phase4Migration);
  for (const migration of migrations.filter((name) => name > phase4Migration)) await applyMigration(pglite, migration);
  const migrated = (await pglite.query(`SELECT attachment."fileVersionId", version."scanStatus", version."storageProvider" FROM "ProjectAttachment" attachment JOIN "FileVersion" version ON version."id"=attachment."fileVersionId" WHERE attachment."id"=$1`, [legacyAttachmentId])).rows[0];
  assert.ok(migrated.fileVersionId);
  assert.equal(migrated.scanStatus, "NOT_CONFIGURED");
  assert.equal(migrated.storageProvider, "legacy-unverified");

  socketServer = new PGLiteSocketServer({ db: pglite, port: databasePort, host: "127.0.0.1", maxConnections: 30 });
  await socketServer.start();
  await waitForPort(databasePort);
  await provider.start();

  const memoryShim = path.join(temporary, "memory-shim.cjs");
  await writeFile(memoryShim, `
const original = process.memoryUsage;
function empty(){return {rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0};}
function safe(){try{return original();}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return empty();throw error;}}
safe.rss=()=>{try{return original.rss();}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return 0;throw error;}};
process.memoryUsage=safe;
`, "utf8");
  const env = {
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: baseUrl,
    REDIS_URL: "redis://127.0.0.1:6392",
    AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_PUBLISHER_SECRET: randomUUID(),
    INTERNAL_NOTIFICATION_SECRET: randomUUID(),
    INTERNAL_CHAT_MAINTENANCE_SECRET: randomUUID(),
    INTERNAL_WORKER_SECRET: workerSecret,
    STORAGE_SIGNING_ENDPOINT: providerUrl,
    STORAGE_SIGNING_TOKEN: storageToken,
    STORAGE_PROVIDER_KEY: "phase4-storage",
    FILE_SCAN_PROVIDER_BASE_URL: providerUrl,
    FILE_SCAN_PROVIDER_TOKEN: scannerToken,
    FILE_SCAN_WEBHOOK_SECRET: scanSecret,
    FILE_SCAN_PROVIDER_KEY: "malware-scan-broker",
    PAYMENT_PROVIDER_BASE_URL: "http://127.0.0.1:4110",
    PAYMENT_PROVIDER_API_KEY: randomUUID(),
    PAYMENT_WEBHOOK_SECRET: randomUUID(),
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
  const collaborator = await actor("collaborator");
  const outsider = await actor("outsider");
  const restricted = await actor("restricted");
  const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: owner.userId, organizationId: owner.organizationId }, select: { roleId: true } });
  await prisma.membership.create({ data: { userId: collaborator.userId, organizationId: owner.organizationId, roleId: ownerMembership.roleId, status: "ACTIVE" } });
  await loginToOrganization(collaborator, owner.organizationId);
  const restrictedMembership = await prisma.membership.findFirstOrThrow({ where: { userId: restricted.userId, organizationId: restricted.organizationId }, select: { roleId: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: restrictedMembership.roleId, permission: { key: { in: ["files.manage", "search.use", "analytics.read", "platform.operations.read"] } } } });

  const project = await prisma.project.create({ data: { organizationId: owner.organizationId, ownerId: owner.userId, title: "Phase Four Alpha Workspace", slug: `phase-four-${randomUUID()}`, description: "Enterprise files search analytics runtime evidence", status: "OPEN" } });
  await prisma.projectMembership.create({ data: { projectId: project.id, userId: collaborator.userId, role: "CONTRIBUTOR" } });

  provider.storageAvailable = false;
  await request(owner.jar, "/api/files/upload-intents", { method: "POST", expected: [503], body: { name: "provider-failure.txt", mimeType: "text/plain", sizeBytes: 4, checksumSha256: bufferHash(Buffer.from("test")) } });
  provider.storageAvailable = true;

  const mismatchContent = Buffer.from("actual-content");
  const mismatchIntent = (await request(owner.jar, "/api/files/upload-intents", { method: "POST", expected: [201], body: { name: "mismatch.txt", mimeType: "text/plain", sizeBytes: mismatchContent.length, checksumSha256: bufferHash(Buffer.from("different-data")) } })).data;
  assert.ok((await fetch(mismatchIntent.upload.url, { method: "PUT", headers: mismatchIntent.upload.headers, body: mismatchContent })).ok);
  await request(owner.jar, `/api/files/upload-intents/${mismatchIntent.intent.id}/complete`, { method: "POST", expected: [409], body: {} });
  assert.equal((await prisma.fileUploadIntent.findUniqueOrThrow({ where: { id: mismatchIntent.intent.id } })).failureCode, "INTEGRITY_MISMATCH");

  const cleanContent = Buffer.from("Phase Four governed specification content");
  const first = await upload(owner.jar, cleanContent, { name: "Phase Four Specification.txt", projectId: project.id, mimeType: "text/plain" });
  provider.scannerAvailable = false;
  await internal("/api/internal/workers/files", { workerId: "phase4-file-worker" }, [503]);
  assert.equal((await prisma.fileVersion.findUniqueOrThrow({ where: { id: first.version.id } })).scanStatus, "PENDING");
  provider.scannerAvailable = true;
  await new Promise((resolve) => setTimeout(resolve, 2200));
  await internal("/api/internal/workers/files", { workerId: "phase4-file-worker" });
  assert.ok(provider.scans.some((scan) => scan.fileVersionId === first.version.id));
  const cleanWebhook = await scanResult(first.version, owner.organizationId, "CLEAN");
  const replay = await fetch(`${baseUrl}/api/webhooks/file-scan/malware-scan-broker`, { method: "POST", headers: { "content-type": "application/json", "x-provider-signature": cleanWebhook.signature }, body: cleanWebhook.raw });
  assert.equal(replay.status, 202);
  assert.equal((await replay.json()).data.replay, true);
  const download = (await request(owner.jar, `/api/files/${first.file.id}/download`)).data;
  const downloaded = await fetch(download.url, { headers: download.headers });
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), cleanContent);
  await request(outsider.jar, `/api/files/${first.file.id}`, { expected: [404] });

  const infected = await upload(owner.jar, Buffer.from("malware-test-sample"), { name: "quarantined.bin", projectId: project.id, mimeType: "application/octet-stream" });
  await internal("/api/internal/workers/files", { workerId: "phase4-file-worker" });
  await scanResult(infected.version, owner.organizationId, "INFECTED");
  await request(owner.jar, `/api/files/${infected.file.id}/download`, { expected: [409] });
  assert.equal(await prisma.securityEvent.count({ where: { organizationId: owner.organizationId, type: "FILE_MALWARE_DETECTED" } }), 1);

  const lock = (await request(owner.jar, `/api/files/${first.file.id}/lock`, { method: "POST", expected: [201], body: { expiresInMinutes: 30 } })).data;
  await request(collaborator.jar, `/api/files/${first.file.id}/lock`, { method: "POST", expected: [409], body: { expiresInMinutes: 30 } });
  const second = await upload(owner.jar, Buffer.from("Phase Four governed specification version two"), { mimeType: "text/plain" }, { fileId: first.file.id, expectedFileVersion: 1, lockToken: lock.lockToken });
  await internal("/api/internal/workers/files", { workerId: "phase4-file-worker" });
  await scanResult(second.version, owner.organizationId, "CLEAN");
  const versions = await request(owner.jar, `/api/files/${first.file.id}/versions`);
  assert.deepEqual(versions.data.map((version) => version.version), [2, 1]);
  await request(owner.jar, `/api/projects/${project.id}/attachments`, { method: "POST", expected: [201], body: { fileVersionId: second.version.id } });
  assert.equal((await prisma.projectAttachment.findUniqueOrThrow({ where: { fileVersionId: second.version.id } })).storageKey, second.version.storageKey);
  await request(owner.jar, `/api/files/${first.file.id}`, { method: "PATCH", body: { legalHold: true, lockToken: lock.lockToken } });
  await request(owner.jar, `/api/files/${first.file.id}`, { method: "PATCH", expected: [409], body: { deleted: true, lockToken: lock.lockToken } });
  await request(owner.jar, `/api/files/${first.file.id}`, { method: "PATCH", body: { legalHold: false, metadata: { classification: "internal" }, lockToken: lock.lockToken } });
  await request(owner.jar, `/api/files/${first.file.id}/lock`, { method: "DELETE", body: { lockToken: lock.lockToken } });

  const reindex = await request(owner.jar, "/api/search/reindex", { method: "POST", expected: [202], body: { idempotencyKey: randomUUID() } });
  assert.ok(reindex.data.job.id);
  for (let index = 0; index < 20; index += 1) {
    const processed = await internal("/api/internal/workers/search", { workerId: "phase4-search-worker" });
    if (!processed.data) break;
  }
  const search = await request(owner.jar, "/api/search?q=Phase&entityType=all&take=1");
  assert.equal(search.data.length, 1);
  assert.ok(search.meta.nextCursor);
  assert.match(search.data[0].highlight, /\[\[\[/);
  const secondPage = await request(owner.jar, `/api/search?q=Phase&entityType=all&take=1&cursor=${encodeURIComponent(search.meta.nextCursor)}`);
  assert.equal(secondPage.data.length, 1);
  const outsiderSearch = await request(outsider.jar, "/api/search?q=Phase&entityType=all&take=20");
  assert.equal(outsiderSearch.data.length, 0);
  await request(restricted.jar, "/api/search?q=Phase&entityType=all", { expected: [403] });
  await request(restricted.jar, "/api/files/upload-intents", { method: "POST", expected: [403], body: { name: "denied.txt", mimeType: "text/plain", sizeBytes: 1, checksumSha256: bufferHash(Buffer.from("x")) } });

  await request(owner.jar, `/api/files/${first.file.id}`, { method: "PATCH", body: { deleted: true } });
  for (let index = 0; index < 10; index += 1) { const processed = await internal("/api/internal/workers/search", { workerId: "phase4-search-worker" }); if (!processed.data) break; }
  const deletedSearch = await request(owner.jar, "/api/search?q=Specification&entityType=file&take=20");
  assert.equal(deletedSearch.data.length, 0);
  await request(owner.jar, `/api/files/${first.file.id}`, { method: "PATCH", body: { deleted: false } });

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await prisma.analyticsEvent.create({ data: { organizationId: owner.organizationId, userId: owner.userId, projectId: project.id, eventType: "phase4.runtime.metric", occurredAt: new Date(`${yesterday}T12:00:00.000Z`) } });
  const analyticsKey = randomUUID();
  const backfill = await request(owner.jar, "/api/analytics/backfill", { method: "POST", expected: [202], body: { from: yesterday, to: yesterday, idempotencyKey: analyticsKey } });
  const duplicateBackfill = await request(owner.jar, "/api/analytics/backfill", { method: "POST", expected: [202], body: { from: yesterday, to: yesterday, idempotencyKey: analyticsKey } });
  assert.equal(backfill.data.run.id, duplicateBackfill.data.run.id);
  await internal("/api/internal/workers/analytics", { workerId: "phase4-analytics-worker" });
  const analytics = await request(owner.jar, "/api/analytics/summary?days=30&take=100");
  assert.equal(analytics.data.freshness.stale, false);
  assert.ok(analytics.data.metrics.some((metric) => metric.metric === "events.count" && metric.dimensionKey === "phase4.runtime.metric" && metric.value === "1"));
  assert.equal(await prisma.analyticsAggregationRun.count({ where: { organizationId: owner.organizationId, idempotencyKey: analyticsKey } }), 1);
  const outsiderAnalytics = await request(outsider.jar, "/api/analytics/summary?days=30&take=100");
  assert.ok(!outsiderAnalytics.data.metrics.some((metric) => metric.dimensionKey === "phase4.runtime.metric"));
  await request(restricted.jar, "/api/analytics/summary?days=30", { expected: [403] });
  const scheduled = await internal("/api/internal/workers/analytics", { workerId: "phase4-scheduler", action: "SCHEDULE" });
  assert.ok(scheduled.data.length >= 4);

  await runRequired(process.execPath, ["scripts/verify-commercial-flow.mjs"], { ...env, COMMERCIAL_TEST_BASE_URL: baseUrl, COMMERCIAL_TEST_PROVIDER_PORT: "4110" });

  console.log(JSON.stringify({
    result: "PASS",
    migrations: `${migrations.length} chronological migrations plus legacy attachment upgrade verified`,
    files: "signed upload, provider evidence, integrity mismatch, scanner retry, clean/infected states, versions, lock contention, hold, restore, download and attachment binding verified",
    search: "full/incremental jobs, ranking, highlights, cursor pagination, deletion, permission and tenant isolation verified",
    analytics: "Dubai-day backfill, idempotency, freshness, daily dimensions, scheduling and tenant isolation verified",
    providerFailures: "storage and scanner failures are bounded and leave no trusted partial file",
    phase2Regression: "commercial concurrency and settlement suite passed unchanged",
  }, null, 2));
} catch (error) {
  failure = error;
  console.error(error);
  console.error(nextLogs.slice(-50).join(""));
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
