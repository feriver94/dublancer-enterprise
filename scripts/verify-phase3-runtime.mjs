import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const projectRoot = process.cwd();
const databasePort = Number(process.env.PHASE3_DATABASE_PORT ?? 55433);
const redisPort = Number(process.env.PHASE3_REDIS_PORT ?? 6391);
const applicationPort = Number(process.env.PHASE3_APPLICATION_PORT ?? 3110);
const productionRuntime = process.env.PHASE3_RUNTIME_SERVER === "production";
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporaryDatabase = await mkdtemp(path.join(projectRoot, ".phase3-runtime-"));
const prismaTemporaryDirectory = path.join(temporaryDatabase, "tmp");
await mkdir(prismaTemporaryDirectory);
const childProcesses = new Set();
const nextLogs = [];

class CookieJar {
  cookies = new Map();

  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = value.split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator > 0) this.cookies.set(first.slice(0, separator), first.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function encodeRedis(value) {
  if (Array.isArray(value)) return `*${value.length}\r\n${value.map(encodeRedis).join("")}`;
  if (typeof value === "number") return `:${value}\r\n`;
  if (value === null) return "$-1\r\n";
  const text = String(value);
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
}

function parseRedis(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const type = String.fromCharCode(buffer[offset]);
  const end = buffer.indexOf("\r\n", offset + 1);
  if (end < 0) return null;
  const header = buffer.subarray(offset + 1, end).toString();
  if (type === "*" || type === ">") {
    const count = Number(header);
    const values = [];
    let cursor = end + 2;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedis(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: values, offset: cursor };
  }
  if (type === "$") {
    const length = Number(header);
    if (length < 0) return { value: null, offset: end + 2 };
    const start = end + 2;
    const next = start + length + 2;
    if (buffer.length < next) return null;
    return { value: buffer.subarray(start, start + length).toString(), offset: next };
  }
  if (type === ":") return { value: Number(header), offset: end + 2 };
  return { value: header, offset: end + 2 };
}

class TestRedisServer {
  server = null;
  sockets = new Set();
  subscriptions = new Map();
  counters = new Map();

  async start() {
    if (this.server) return;
    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      let pending = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length > 0) {
          const parsed = parseRedis(pending);
          if (!parsed) break;
          pending = pending.subarray(parsed.offset);
          this.command(socket, parsed.value);
        }
      });
      const clean = () => {
        this.sockets.delete(socket);
        for (const subscribers of this.subscriptions.values()) subscribers.delete(socket);
      };
      socket.on("close", clean);
      socket.on("error", clean);
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(redisPort, "127.0.0.1", resolve);
    });
  }

  command(socket, frame) {
    if (!Array.isArray(frame) || frame.length === 0) return;
    const [rawCommand, ...args] = frame;
    const command = String(rawCommand).toUpperCase();
    if (["AUTH", "SELECT", "CLIENT"].includes(command)) {
      socket.write("+OK\r\n");
      return;
    }
    if (command === "INFO") {
      socket.write(encodeRedis("# Server\r\nredis_version:7.2.0\r\nloading:0\r\n"));
      return;
    }
    if (command === "PING") {
      socket.write(args.length ? encodeRedis(args[0]) : "+PONG\r\n");
      return;
    }
    if (command === "EVAL") {
      const key = String(args[2]);
      const windowMs = Number(args[3]);
      const now = Date.now();
      const previous = this.counters.get(key);
      const current = !previous || previous.expiresAt <= now
        ? { count: 1, expiresAt: now + windowMs }
        : { count: previous.count + 1, expiresAt: previous.expiresAt };
      this.counters.set(key, current);
      socket.write(encodeRedis([current.count, Math.max(current.expiresAt - now, 0)]));
      return;
    }
    if (command === "SUBSCRIBE") {
      for (const topicValue of args) {
        const topic = String(topicValue);
        const subscribers = this.subscriptions.get(topic) ?? new Set();
        subscribers.add(socket);
        this.subscriptions.set(topic, subscribers);
        socket.write(encodeRedis(["subscribe", topic, subscribers.size]));
      }
      return;
    }
    if (command === "UNSUBSCRIBE") {
      const topics = args.length ? args.map(String) : [...this.subscriptions.keys()];
      for (const topic of topics) {
        this.subscriptions.get(topic)?.delete(socket);
        socket.write(encodeRedis(["unsubscribe", topic, 0]));
      }
      return;
    }
    if (command === "PUBLISH") {
      const topic = String(args[0]);
      const message = String(args[1]);
      const subscribers = [...(this.subscriptions.get(topic) ?? [])].filter((candidate) => !candidate.destroyed);
      for (const subscriber of subscribers) subscriber.write(encodeRedis(["message", topic, message]));
      socket.write(`:${subscribers.length}\r\n`);
      return;
    }
    if (command === "QUIT") {
      socket.write("+OK\r\n");
      socket.end();
      return;
    }
    socket.write("+OK\r\n");
  }

  async stop() {
    if (!this.server) return;
    for (const socket of this.sockets) socket.destroy();
    const active = this.server;
    this.server = null;
    await new Promise((resolve) => active.close(resolve));
    this.sockets.clear();
    this.subscriptions.clear();
  }
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  childProcesses.add(child);
  child.once("exit", () => childProcesses.delete(child));
  return child;
}

async function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
      socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for port ${port}.`);
}

async function waitForApplication(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application did not become ready.\n${nextLogs.slice(-30).join("")}`);
}

async function request(jar, route, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
  let token;
  if (csrf) {
    const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { cookie: jar.header() } });
    jar.absorb(bootstrap);
    const envelope = await bootstrap.json();
    assert.equal(bootstrap.status, 200, `CSRF bootstrap failed: ${JSON.stringify(envelope)}`);
    token = envelope.data.csrfToken;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    redirect: "manual",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { "x-csrf-token": token } : {}),
      ...(jar.header() ? { cookie: jar.header() } : {}),
      origin: baseUrl,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar.absorb(response);
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${method} ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, meta: envelope.meta, error: envelope.error, headers: response.headers };
}

async function page(jar, route) {
  return fetch(`${baseUrl}${route}`, {
    redirect: "manual",
    headers: jar?.header() ? { cookie: jar.header() } : {},
  });
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase3-${label}-${randomUUID()}@example.test`;
  const password = "Phase3!Enterprise123";
  const registration = await request(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase 3 ${label}`, password },
  });
  await request(jar, "/api/auth/login", {
    method: "POST",
    body: { email, password, organizationId: registration.data.organizationId },
  });
  return { jar, email, password, userId: registration.data.id, organizationId: registration.data.organizationId };
}

async function loginToOrganization(actorRow, organizationId) {
  await request(actorRow.jar, "/api/auth/login", {
    method: "POST",
    body: { email: actorRow.email, password: actorRow.password, organizationId },
  });
  actorRow.organizationId = organizationId;
}

function runRequired(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(command, args, { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed:\n${stdout}\n${stderr}`));
    });
  });
}

async function applyMigrations(database) {
  const migrationsRoot = path.join(projectRoot, "prisma/migrations");
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(entries.length > 0, "At least one migration is required.");
  for (const migration of entries) {
    const sql = await readFile(path.join(migrationsRoot, migration, "migration.sql"), "utf8");
    await database.exec(sql);
    process.stdout.write(`Applied migration ${migration}\n`);
  }
  return entries;
}

const redisServer = new TestRedisServer();
let prisma;
let pglite;
let postgresServer;

try {
  pglite = new PGlite(path.join(temporaryDatabase, "database"));
  await pglite.waitReady;
  const appliedMigrations = await applyMigrations(pglite);
  postgresServer = new PGLiteSocketServer({
    db: pglite,
    port: databasePort,
    host: "127.0.0.1",
    maxConnections: 30,
  });
  await postgresServer.start();
  await waitForPort(databasePort);

  const memoryShim = path.join(temporaryDatabase, "memory-shim.cjs");
  await writeFile(memoryShim, `
const original = process.memoryUsage;
function empty() { return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }; }
function safe() { try { return original(); } catch (error) { if (error && error.syscall === "uv_resident_set_memory") return empty(); throw error; } }
safe.rss = () => { try { return original.rss(); } catch (error) { if (error && error.syscall === "uv_resident_set_memory") return 0; throw error; } };
process.memoryUsage = safe;
`, "utf8");

  const applicationEnv = {
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: baseUrl,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_PUBLISHER_SECRET: randomUUID(),
    INTERNAL_NOTIFICATION_SECRET: randomUUID(),
    INTERNAL_CHAT_MAINTENANCE_SECRET: randomUUID(),
    INTERNAL_WORKER_SECRET: randomUUID(),
    PAYMENT_PROVIDER_BASE_URL: "http://127.0.0.1:4110",
    PAYMENT_PROVIDER_API_KEY: randomUUID(),
    PAYMENT_WEBHOOK_SECRET: randomUUID(),
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: prismaTemporaryDirectory,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim(),
  };
  await runRequired(process.execPath, ["prisma/seed.mjs"], applicationEnv);

  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await redisServer.start();
  if (!productionRuntime) {
    await rm(path.join(projectRoot, ".next"), { recursive: true, force: true });
  }

  const next = startProcess(
    path.join(projectRoot, "node_modules/.bin/next"),
    productionRuntime
      ? ["start", "--hostname", "127.0.0.1", "--port", String(applicationPort)]
      : ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)],
    { env: { ...applicationEnv, NODE_ENV: productionRuntime ? "production" : "development" } },
  );
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => {
    nextLogs.push(chunk.toString());
    if (nextLogs.length > 300) nextLogs.shift();
  });
  await waitForApplication();

  const anonymousRoute = await page(null, "/communications/chat");
  assert.ok([303, 307, 308].includes(anonymousRoute.status));
  assert.match(anonymousRoute.headers.get("location") ?? "", /^\/login\?returnTo=/);

  const owner = await actor("owner");
  const collaborator = await actor("collaborator");
  const outsider = await actor("outsider");
  const restricted = await actor("restricted");

  const ownerMembership = await prisma.membership.findFirstOrThrow({
    where: { userId: owner.userId, organizationId: owner.organizationId },
    select: { roleId: true },
  });
  await prisma.membership.create({
    data: { userId: collaborator.userId, organizationId: owner.organizationId, roleId: ownerMembership.roleId, status: "ACTIVE" },
  });
  await loginToOrganization(collaborator, owner.organizationId);

  const restrictedMembership = await prisma.membership.findFirstOrThrow({
    where: { userId: restricted.userId, organizationId: restricted.organizationId },
    select: { roleId: true },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: restrictedMembership.roleId, permission: { key: "chat.read" } },
  });

  const authenticatedRoute = await page(owner.jar, "/communications/chat");
  assert.equal(authenticatedRoute.status, 200);
  const deniedRoute = await page(restricted.jar, "/communications/chat");
  assert.ok([303, 307, 308].includes(deniedRoute.status));
  assert.match(deniedRoute.headers.get("location") ?? "", /^\/dashboard\?accessDenied=chat\.read/);
  await request(restricted.jar, "/api/chat/channels", { expected: [403] });

  const channel = (await request(owner.jar, "/api/chat/channels", {
    method: "POST",
    expected: [201],
    body: {
      type: "GROUP",
      visibility: "PRIVATE",
      name: "Phase 3 runtime room",
      description: "Production chat runtime verification.",
      memberUserIds: [collaborator.userId],
    },
  })).data;
  await request(owner.jar, "/api/chat/channels", {
    method: "POST",
    expected: [201],
    body: { type: "GROUP", visibility: "PRIVATE", name: "Pagination room", memberUserIds: [] },
  });
  const channelPage = await request(owner.jar, "/api/chat/channels?take=1");
  assert.equal(channelPage.data.length, 1);
  assert.ok(channelPage.meta.nextCursor);
  const collaboratorChannels = await request(collaborator.jar, "/api/chat/channels?take=20");
  assert.ok(collaboratorChannels.data.some((row) => row.id === channel.id));
  await request(outsider.jar, `/api/chat/channels/${channel.id}`, { expected: [404] });

  const firstMessage = (await request(collaborator.jar, `/api/chat/channels/${channel.id}/messages`, {
    method: "POST",
    expected: [201],
    body: {
      body: "Runtime message with a governed mention.",
      format: "PLAIN_TEXT",
      clientMessageId: randomUUID(),
      mentionedUserIds: [owner.userId],
    },
  })).data;
  const secondMessage = (await request(owner.jar, `/api/chat/channels/${channel.id}/messages`, {
    method: "POST", expected: [201], body: { body: "Second paginated message.", clientMessageId: randomUUID(), mentionedUserIds: [] },
  })).data;
  await request(collaborator.jar, `/api/chat/channels/${channel.id}/messages`, {
    method: "POST", expected: [201], body: { body: "Third paginated message.", clientMessageId: randomUUID(), mentionedUserIds: [] },
  });
  const messagePage = await request(owner.jar, `/api/chat/channels/${channel.id}/messages?take=2`);
  assert.equal(messagePage.data.length, 2);
  assert.ok(messagePage.meta.nextSequence);

  const reactionPath = `/api/chat/channels/${channel.id}/messages/${firstMessage.id}/reactions`;
  let reactionCreated = await request(owner.jar, reactionPath, { method: "POST", expected: [201, 404], body: { emoji: "👍" } });
  if (reactionCreated.status === 404 && !reactionCreated.error?.code) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    reactionCreated = await request(owner.jar, reactionPath, { method: "POST", expected: [201], body: { emoji: "👍" } });
  }
  assert.equal(reactionCreated.status, 201);
  const reacted = await request(owner.jar, `/api/chat/channels/${channel.id}/messages?take=20`);
  assert.ok(reacted.data.find((row) => row.id === firstMessage.id).reactions.some((row) => row.emoji === "👍"));
  await request(owner.jar, reactionPath, { method: "DELETE", body: { emoji: "👍" } });

  const reply = (await request(owner.jar, `/api/chat/channels/${channel.id}/messages`, {
    method: "POST",
    expected: [201],
    body: { body: "Thread reply with durable pagination.", parentId: firstMessage.id, clientMessageId: randomUUID(), mentionedUserIds: [] },
  })).data;
  assert.equal(reply.parentId, firstMessage.id);
  const thread = await request(collaborator.jar, `/api/chat/channels/${channel.id}/messages?parentId=${firstMessage.id}&take=20`);
  assert.ok(thread.data.some((row) => row.id === reply.id));
  await request(owner.jar, `/api/chat/channels/${channel.id}/read`, { method: "POST", body: { sequence: secondMessage.sequence } });

  for (const actorRow of [owner, collaborator]) {
    await request(actorRow.jar, "/api/realtime/presence/heartbeat", {
      method: "POST",
      body: { status: "ONLINE", resourceType: "CHAT_CHANNEL", resourceId: channel.id },
    });
  }
  const presence = await request(owner.jar, `/api/realtime/presence?channelId=${channel.id}`);
  assert.equal(presence.data.length, 2);
  await request(outsider.jar, `/api/realtime/presence?channelId=${channel.id}`, { expected: [404] });
  await request(outsider.jar, "/api/realtime/presence/heartbeat", {
    method: "POST",
    expected: [404],
    body: { status: "ONLINE", resourceType: "CHAT_CHANNEL", resourceId: channel.id },
  });

  let notifications = await request(owner.jar, "/api/notifications?category=CHAT&take=1");
  assert.equal(notifications.data.length, 1);
  assert.ok(notifications.meta.nextCursor, "Multiple chat notifications must expose a pagination cursor.");
  const notification = notifications.data[0];
  assert.match(notification.actionUrl, new RegExp(`^/communications/chat\\?channelId=${channel.id}`));
  await request(owner.jar, `/api/notifications/${notification.id}`, { method: "PATCH", body: { action: "read" } });
  await request(owner.jar, `/api/notifications/${notification.id}`, { method: "PATCH", body: { action: "unread" } });
  await request(owner.jar, `/api/notifications/${notification.id}`, { method: "PATCH", body: { action: "archive" } });
  const archived = await request(owner.jar, "/api/notifications?status=ARCHIVED&take=20");
  assert.ok(archived.data.some((row) => row.id === notification.id));
  await request(owner.jar, "/api/notifications/read-all", { method: "POST", body: {} });

  await request(owner.jar, "/api/notification-preferences", {
    method: "PUT",
    body: { category: "CHAT", channel: "IN_APP", enabled: true, locale: "en-AE" },
  });
  const preferences = await request(owner.jar, "/api/notification-preferences");
  assert.ok(preferences.data.some((row) => row.category === "CHAT" && row.organizationId === owner.organizationId));

  const foreignNotification = await prisma.userNotification.create({
    data: {
      userId: owner.userId,
      organizationId: outsider.organizationId,
      type: "TENANT_ISOLATION_PROBE",
      category: "CHAT",
      title: "Must remain isolated",
    },
  });
  notifications = await request(owner.jar, "/api/notifications?take=100");
  assert.ok(!notifications.data.some((row) => row.id === foreignNotification.id));
  await request(owner.jar, `/api/notifications/${foreignNotification.id}`, { method: "PATCH", expected: [404], body: { action: "read" } });

  await redisServer.stop();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const outageStartedAt = Date.now();
  const durableDuringOutage = await request(owner.jar, `/api/chat/channels/${channel.id}/messages`, {
    method: "POST",
    expected: [201],
    body: { body: "Durable message while Redis is unavailable.", clientMessageId: randomUUID(), mentionedUserIds: [] },
  });
  assert.ok(Date.now() - outageStartedAt < 5_000, "Redis outage handling must be bounded.");
  assert.equal((await prisma.chatMessage.count({ where: { id: durableDuringOutage.data.id } })), 1);
  const outageRateLimitKey = createHash("sha256")
    .update(`chat.message:${channel.id}:${owner.userId}`)
    .digest("hex");
  assert.ok(await prisma.rateLimitBucket.findUnique({ where: { key: outageRateLimitKey } }));
  const typingDuringOutage = await request(owner.jar, `/api/chat/channels/${channel.id}/typing`, {
    method: "POST", expected: [202], body: { active: true },
  });
  assert.equal(typingDuringOutage.data.realtimeAvailable, false);
  const unavailableStream = await fetch(`${baseUrl}/api/realtime/stream?channelId=${channel.id}`, {
    headers: { cookie: owner.jar.header(), accept: "text/event-stream" },
  });
  assert.equal(unavailableStream.status, 503);
  assert.equal((await unavailableStream.json()).error.code, "SERVICE_UNAVAILABLE");

  await redisServer.start();
  let recoveredTyping;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recoveredTyping = await request(owner.jar, `/api/chat/channels/${channel.id}/typing`, {
      method: "POST", expected: [202], body: { active: true },
    });
    if (recoveredTyping.data.realtimeAvailable) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(recoveredTyping.data.realtimeAvailable, true);

  const controller = new AbortController();
  const recoveredStream = await fetch(`${baseUrl}/api/realtime/stream?channelId=${channel.id}`, {
    headers: { cookie: owner.jar.header(), accept: "text/event-stream" },
    signal: controller.signal,
  });
  assert.equal(recoveredStream.status, 200);
  assert.match(recoveredStream.headers.get("content-type") ?? "", /text\/event-stream/);
  const firstChunk = await recoveredStream.body.getReader().read();
  assert.match(Buffer.from(firstChunk.value).toString(), /event: connected/);
  controller.abort();

  await runRequired(process.execPath, ["scripts/verify-commercial-flow.mjs"], {
    ...applicationEnv,
    COMMERCIAL_TEST_BASE_URL: baseUrl,
    COMMERCIAL_TEST_PROVIDER_PORT: "4110",
  });

  console.log(JSON.stringify({
    result: "PASS",
    authenticatedRouting: "anonymous redirect, authorized 200, permission redirect and API 403 verified",
    chat: "channels, messages, pagination, threads, reactions, read state, typing and presence verified",
    notifications: "tenant isolation, pagination, deep link, read/unread/archive and preferences verified",
    redis: "outage persistence, bounded 503 degradation and recovery verified",
    phase2CommercialRegression: "atomic award, contracts, invoices, settlement, refund and reconciliation rerun successfully",
    prismaMigrationAndSeed: `${appliedMigrations.length} chronological migrations and seed verified on a fresh database`,
    serverMode: productionRuntime ? "production build" : "development webpack",
  }, null, 2));
} catch (error) {
  console.error(error);
  console.error(nextLogs.slice(-50).join(""));
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect().catch(() => undefined);
  await redisServer.stop().catch(() => undefined);
  for (const child of childProcesses) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const child of childProcesses) child.kill("SIGKILL");
  await postgresServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporaryDatabase, { recursive: true, force: true }).catch(() => undefined);
}
