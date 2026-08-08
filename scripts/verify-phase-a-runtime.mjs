import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const databasePort = Number(process.env.PHASE_A_DATABASE_PORT ?? 55481);
const applicationPort = Number(process.env.PHASE_A_APPLICATION_PORT ?? 3181);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase-a-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);

const children = new Set();
const nextLogs = [];
let pglite;
let socketServer;
let prisma;
let failure;

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const cookie = value.split(";", 1)[0];
      const separator = cookie.indexOf("=");
      if (separator > 0) this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
  header() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "); }
}

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function runRequired(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = startProcess(command, args, env);
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed:\n${output}`)));
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
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health/live`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application did not become ready.\n${nextLogs.slice(-80).join("")}`);
}

async function browserRequest(jar, route, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
  let csrfToken;
  if (csrf) {
    const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, { headers: jar?.header() ? { cookie: jar.header() } : {} });
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
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response);
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${method} ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase-a-${label}-${randomUUID()}@example.test`;
  const password = "PhaseA!Enterprise123";
  const registration = await browserRequest(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase A ${label}`, password },
  });
  const login = await browserRequest(jar, "/api/auth/login", {
    method: "POST",
    body: { email, password, organizationId: registration.data.organizationId, deviceLabel: `${label} persona runtime` },
  });
  assert.equal(login.data.onboardingRequired, true);
  return { jar, email, userId: registration.data.id, organizationId: registration.data.organizationId };
}

try {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(migrations.at(-1), "20260802100000_dual_profile_marketplace_phase_c");
  for (const migration of migrations) {
    await pglite.exec(await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
    process.stdout.write(`Applied migration ${migration}\n`);
  }
  socketServer = new PGLiteSocketServer({ db: pglite, port: databasePort, host: "127.0.0.1", maxConnections: 30 });
  await socketServer.start();
  await waitForPort(databasePort);

  const memoryShim = path.join(temporary, "memory-shim.cjs");
  await writeFile(memoryShim, `const original=process.memoryUsage;function empty(){return{rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0}}function safe(){try{return original()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return empty();throw error}}safe.rss=()=>{try{return original.rss()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return 0;throw error}};process.memoryUsage=safe;`, "utf8");
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
    INTERNAL_WORKER_SECRET: `${randomUUID()}${randomUUID()}`,
    REDIS_URL: "redis://127.0.0.1:1",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: prismaTemporary,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim(),
  };
  await runRequired(process.execPath, ["prisma/seed.mjs"], env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(path.join(root, "node_modules/.bin/next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)], env);
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => { nextLogs.push(chunk.toString()); if (nextLogs.length > 500) nextLogs.shift(); });
  await waitForApplication();

  const owner = await actor("owner");
  const outsider = await actor("outsider");
  const initial = await browserRequest(owner.jar, "/api/personas");
  assert.equal(initial.data.account.onboardingProgress.status, "IN_PROGRESS");
  assert.equal(initial.data.account.accountPersonas.filter((persona) => persona.type === "CLIENT").length, 1);
  assert.equal(initial.data.account.accountPersonas.filter((persona) => persona.type === "ORGANIZATION").length, 1);
  const organizationPersona = initial.data.account.accountPersonas.find((persona) => persona.type === "ORGANIZATION");
  assert.equal(initial.data.activePersonaId, organizationPersona.id);
  await browserRequest(outsider.jar, "/api/personas/switch", { method: "POST", expected: [403], body: { personaId: organizationPersona.id } });

  await browserRequest(owner.jar, "/api/marketplace/listings", {
    method: "POST",
    expected: [201],
    body: {
      title: "Phase A organization listing",
      description: "Organization persona authorization creates this marketplace listing.",
      engagementType: "FIXED_PRICE",
      experienceLevel: "EXPERT",
      currency: "AED",
      visibility: "PUBLIC",
      remoteAllowed: true,
      publish: true,
      skillIds: [],
    },
  });

  await browserRequest(owner.jar, "/api/onboarding", {
    method: "PATCH",
    body: {
      identity: { displayName: "Phase A Owner", countryCode: "AE", timezone: "Asia/Dubai", locale: "en-AE" },
      selectedPersonaTypes: ["CLIENT", "FREELANCER", "ORGANIZATION"],
      client: { displayName: "Phase A Client", headline: "Enterprise client" },
      freelancer: { headline: "Phase A Provider", bio: "Verified provider onboarding profile.", hourlyRateMinor: "25000", yearsExperience: 8, availability: "AVAILABLE" },
      organization: { organizationId: owner.organizationId, legalName: "Phase A Owner Workspace LLC", tradingName: "Phase A Workspace" },
    },
  });
  const configured = await browserRequest(owner.jar, "/api/personas");
  const freelancerPersona = configured.data.account.accountPersonas.find((persona) => persona.type === "FREELANCER");
  const clientPersona = configured.data.account.accountPersonas.find((persona) => persona.type === "CLIENT");
  assert.ok(freelancerPersona && clientPersona);
  await browserRequest(owner.jar, "/api/onboarding/complete", { method: "POST", body: { preferredPersonaId: freelancerPersona.id } });
  const completed = await browserRequest(owner.jar, "/api/personas");
  assert.equal(completed.data.account.onboardingProgress.status, "COMPLETED");
  assert.equal(completed.data.activePersonaId, freelancerPersona.id);
  assert.ok(completed.data.account.accountPersonas.filter((persona) => ["CLIENT", "FREELANCER", "ORGANIZATION"].includes(persona.type)).every((persona) => persona.status === "ACTIVE"));

  await browserRequest(owner.jar, "/api/marketplace/listings", {
    method: "POST",
    expected: [403],
    body: { title: "Forbidden provider listing", description: "A freelancer persona must not post client listings.", engagementType: "FIXED_PRICE", currency: "AED", visibility: "PUBLIC", remoteAllowed: true, publish: false, skillIds: [] },
  });
  await browserRequest(owner.jar, "/api/marketplace/profile");
  await browserRequest(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: clientPersona.id } });
  const switched = await browserRequest(owner.jar, "/api/auth/session");
  assert.equal(switched.data.activePersona.id, clientPersona.id);
  assert.equal(switched.data.activePersona.type, "CLIENT");

  const account = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId }, include: { personalIdentity: true, onboardingProgress: true, accountPersonas: true } });
  assert.ok(account.personalIdentity?.identityCompletedAt);
  assert.equal(account.onboardingProgress?.status, "COMPLETED");
  assert.equal(account.accountPersonas.length, 3);
  assert.ok(await prisma.personaEvent.count({ where: { actorUserId: owner.userId, type: "SWITCHED" } }) >= 2);
  assert.equal(await prisma.user.count({ where: { email: owner.email } }), 1);

  console.log(JSON.stringify({ result: "PASS", migrations: migrations.length, account: "single", personas: 3, guidedOnboarding: "verified", activation: "verified", switching: "session-bound", authorization: "persona-plus-rbac", tenantIsolation: "verified" }, null, 2));
} catch (error) {
  failure = error;
  console.error(error);
  if (nextLogs.length) console.error(nextLogs.slice(-100).join(""));
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await prisma?.$disconnect().catch(() => undefined);
  await socketServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}

if (failure) process.exitCode = 1;
