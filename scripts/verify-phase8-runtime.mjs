import assert from "node:assert/strict";
import {
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { captureRuntimeBaseline, cleanupRuntime } from "./runtime-cleanup.mjs";

const root = process.cwd();
const runtimeBaseline = await captureRuntimeBaseline(root);
const databasePort = Number(process.env.PHASE8_DATABASE_PORT ?? 55438);
const applicationPort = Number(process.env.PHASE8_APPLICATION_PORT ?? 3115);
const providerPort = Number(process.env.PHASE8_PROVIDER_PORT ?? 4218);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase8-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];
const oidcCodes = new Map();
const sinkPayloads = [];
const internalWorkerSecret = `${randomUUID()}${randomUUID()}`;
const observabilityExportSecret = `${randomUUID()}${randomUUID()}`;

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
  const deadline = Date.now() + 120_000;
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
  {
    method = "GET",
    body,
    expected = [200],
    csrf = method !== "GET",
    headers = {},
  } = {},
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

async function scimRequest(token, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/scim+json",
      ...(options.body ? { "content-type": "application/scim+json" } : {}),
      ...(options.requestId ? { "x-request-id": options.requestId } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  assert.ok(
    (options.expected ?? [200]).includes(response.status),
    `${options.method ?? "GET"} ${route}: ${response.status} ${JSON.stringify(data)}`,
  );
  return { status: response.status, data };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase8-${label}-${randomUUID()}@example.test`;
  const password = "Phase8!Enterprise123";
  const registration = await browserRequest(jar, "/api/auth/register", {
    method: "POST",
    expected: [201],
    body: { email, displayName: `Phase 8 ${label}`, password },
  });
  await browserRequest(jar, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      organizationId: registration.data.organizationId,
      deviceLabel: `${label} workstation`,
    },
    headers: { "x-forwarded-for": "203.0.113.80" },
  });
  return {
    jar,
    email,
    password,
    userId: registration.data.id,
    organizationId: registration.data.organizationId,
  };
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(message)
    .digest();
  const offset = digest.at(-1) & 0x0f;
  const code =
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

let pglite;
let socketServer;
let prisma;
let provider;
let failure;
try {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "phase8-runtime", alg: "RS256", use: "sig" });

  provider = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", providerUrl);
      if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          issuer: providerUrl,
          authorization_endpoint: `${providerUrl}/authorize`,
          token_endpoint: `${providerUrl}/token`,
          jwks_uri: `${providerUrl}/jwks`,
        }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/jwks") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/authorize") {
        const code = randomUUID();
        oidcCodes.set(code, {
          nonce: url.searchParams.get("nonce"),
          clientId: url.searchParams.get("client_id"),
        });
        const callback = new URL(url.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", url.searchParams.get("state"));
        response.writeHead(302, { location: callback.toString() }).end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/token") {
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const code = new URLSearchParams(raw).get("code");
        const attempt = oidcCodes.get(code);
        if (!attempt) {
          response.writeHead(400).end();
          return;
        }
        oidcCodes.delete(code);
        const idToken = await new SignJWT({
          email: `phase8-jit-${randomUUID()}@example.test`,
          name: "Phase 8 JIT User",
          nonce: attempt.nonce,
          acr: "urn:dublancer:aal2",
        })
          .setProtectedHeader({ alg: "RS256", kid: "phase8-runtime" })
          .setIssuer(providerUrl)
          .setAudience(attempt.clientId)
          .setSubject("phase8-jit-subject")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          access_token: randomBytes(24).toString("base64url"),
          token_type: "Bearer",
          id_token: idToken,
        }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/sink") {
        let raw = "";
        for await (const chunk of request) raw += chunk;
        sinkPayloads.push({
          body: JSON.parse(raw),
          signature: request.headers["x-dublancer-signature-256"],
        });
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: true }));
        return;
      }
      response.writeHead(404).end();
    })().catch((error) => {
      response.writeHead(500).end(String(error));
    });
  });
  await new Promise((resolve) =>
    provider.listen(providerPort, "127.0.0.1", resolve),
  );

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
    WEBAUTHN_ORIGIN: baseUrl,
    WEBAUTHN_RP_ID: "127.0.0.1",
    INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_EMAIL_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`,
    INTERNAL_WORKER_SECRET: internalWorkerSecret,
    OBSERVABILITY_EXPORT_SECRET: observabilityExportSecret,
    REDIS_URL: "redis://127.0.0.1:1",
    CACHE_FORCE_PRIMARY_FAILURE: "1",
    EXPOSE_DEVELOPMENT_TOKENS: "true",
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
      if (nextLogs.length > 600) nextLogs.shift();
    });
  }
  await waitForApplication();

  const owner = await actor("owner");
  const outsider = await actor("outsider");
  const oidcProvider = (
    await browserRequest(owner.jar, "/api/identity/administration", {
      method: "POST",
      expected: [201],
      body: {
        action: "provider.create",
        type: "OIDC",
        name: "Phase 8 Runtime OIDC",
        slug: `phase8-oidc-${randomUUID().slice(0, 8)}`,
        issuer: providerUrl,
        callbackUrl: `${baseUrl}/api/auth/sso/oidc/runtime/callback`,
        oidcDiscoveryUrl: `${providerUrl}/.well-known/openid-configuration`,
        oidcClientId: "phase8-client",
        oidcClientSecret: `${randomUUID()}${randomUUID()}`,
        scopes: ["openid", "email", "profile"],
        requiredAcr: "urn:dublancer:aal2",
        assuranceLevel: "AAL2",
        allowedEmailDomains: ["example.test"],
        jitProvisioningEnabled: true,
        status: "ACTIVE",
      },
    })
  ).data;
  await prisma.identityProvider.update({
    where: { id: oidcProvider.id },
    data: {
      callbackUrl: `${baseUrl}/api/auth/sso/oidc/${oidcProvider.id}/callback`,
    },
  });

  const setup = (
    await browserRequest(owner.jar, "/api/auth/mfa", {
      method: "POST",
      expected: [201],
      body: { action: "totp.setup", label: "Phase 8 authenticator" },
    })
  ).data;
  const enrollment = (
    await browserRequest(owner.jar, "/api/auth/mfa", {
      method: "POST",
      body: {
        action: "totp.verify",
        factorId: setup.factorId,
        code: totp(setup.secret),
      },
    })
  ).data;
  assert.equal(enrollment.backupCodes.length, 10);
  const outsiderSetup = (
    await browserRequest(outsider.jar, "/api/auth/mfa", {
      method: "POST",
      expected: [201],
      body: { action: "totp.setup", label: "Independent approver" },
    })
  ).data;
  const outsiderEnrollment = (
    await browserRequest(outsider.jar, "/api/auth/mfa", {
      method: "POST",
      body: {
        action: "totp.verify",
        factorId: outsiderSetup.factorId,
        code: totp(outsiderSetup.secret),
      },
    })
  ).data;

  const mfaJar = new CookieJar();
  const challenge = await browserRequest(mfaJar, "/api/auth/login", {
    method: "POST",
    expected: [202],
    body: {
      email: owner.email,
      password: owner.password,
      organizationId: owner.organizationId,
      deviceLabel: "Phase 8 MFA workstation",
    },
  });
  assert.ok(challenge.data.methods.includes("TOTP"));
  assert.ok(challenge.data.methods.includes("BACKUP_CODE"));
  await browserRequest(mfaJar, "/api/auth/mfa", {
    method: "POST",
    body: {
      action: "challenge.verify",
      challengeToken: challenge.data.challengeToken,
      method: "BACKUP_CODE",
      code: enrollment.backupCodes[0],
    },
  });
  const sessionsBefore = await browserRequest(mfaJar, "/api/auth/sessions");
  assert.ok(sessionsBefore.data.sessions.length >= 2);
  const revoked = await browserRequest(mfaJar, "/api/auth/sessions", {
    method: "POST",
    body: { action: "sessions.revokeOthers" },
  });
  assert.ok(revoked.data.revoked >= 1);
  await browserRequest(owner.jar, "/api/auth/sessions", { expected: [401] });

  const ssoStart = await browserRequest(
    null,
    `/api/auth/sso/${oidcProvider.id}/start?returnTo=%2Fdashboard`,
  );
  const authorize = await fetch(ssoStart.data.authorizationUrl, {
    redirect: "manual",
  });
  assert.equal(authorize.status, 302);
  const callbackUrl = authorize.headers.get("location");
  const ssoJar = new CookieJar();
  const callback = await fetch(callbackUrl, {
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  ssoJar.absorb(callback);
  const callbackData = await callback.json();
  assert.equal(callback.status, 200);
  assert.equal(callbackData.data.authenticated, true);
  assert.equal(callbackData.data.organizationId, owner.organizationId);
  const jitSessions = await browserRequest(ssoJar, "/api/auth/sessions");
  assert.equal(jitSessions.data.sessions[0].authMethod, "OIDC");
  const replay = await fetch(callbackUrl, {
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  assert.equal(replay.status, 401);

  const tokenA = (
    await browserRequest(mfaJar, "/api/identity/administration", {
      method: "POST",
      expected: [201],
      body: {
        action: "scim.token.create",
        name: "Phase 8 directory",
        scopes: ["Users.read", "Users.write"],
      },
    })
  ).data.secret;
  const tokenB = (
    await browserRequest(outsider.jar, "/api/identity/administration", {
      method: "POST",
      expected: [201],
      body: {
        action: "scim.token.create",
        name: "Outside directory",
        scopes: ["Users.read", "Users.write"],
      },
    })
  ).data.secret;
  const serviceConfig = await scimRequest(
    tokenA,
    "/api/scim/v2/ServiceProviderConfig",
  );
  assert.equal(serviceConfig.data.patch.supported, true);
  const scimUser = await scimRequest(tokenA, "/api/scim/v2/Users", {
    method: "POST",
    expected: [201],
    requestId: `create-${randomUUID()}`,
    body: {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      externalId: `phase8-${randomUUID()}`,
      userName: outsider.email,
      displayName: "Phase 8 Independent Approver",
      active: true,
    },
  });
  await scimRequest(tokenB, `/api/scim/v2/Users/${scimUser.data.id}`, {
    expected: [404],
  });
  const suspended = await scimRequest(
    tokenA,
    `/api/scim/v2/Users/${scimUser.data.id}`,
    {
      method: "PATCH",
      body: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", path: "active", value: false }],
      },
    },
  );
  assert.equal(suspended.data.active, false);
  const reactivated = await scimRequest(
    tokenA,
    `/api/scim/v2/Users/${scimUser.data.id}`,
    {
      method: "PATCH",
      body: {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", path: "active", value: true }],
      },
    },
  );
  assert.equal(reactivated.data.active, true);
  assert.equal(
    await prisma.scimProvisioningEvent.count({
      where: { organizationId: owner.organizationId, status: "SUCCEEDED" },
    }),
    3,
  );
  const [approverMembership, ownerRole] = await Promise.all([
    prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: outsider.userId,
          organizationId: owner.organizationId,
        },
      },
    }),
    prisma.role.findFirstOrThrow({
      where: { organizationId: owner.organizationId, name: "Owner" },
    }),
  ]);
  await browserRequest(
    mfaJar,
    `/api/organizations/${owner.organizationId}/members/bulk-role`,
    {
      method: "PATCH",
      body: {
        membershipIds: [approverMembership.id],
        roleId: ownerRole.id,
      },
    },
  );
  const approverJar = new CookieJar();
  const approverChallenge = await browserRequest(
    approverJar,
    "/api/auth/login",
    {
      method: "POST",
      expected: [202],
      body: {
        email: outsider.email,
        password: outsider.password,
        organizationId: owner.organizationId,
        deviceLabel: "Independent approval workstation",
      },
    },
  );
  await browserRequest(approverJar, "/api/auth/mfa", {
    method: "POST",
    body: {
      action: "challenge.verify",
      challengeToken: approverChallenge.data.challengeToken,
      method: "BACKUP_CODE",
      code: outsiderEnrollment.backupCodes[0],
    },
  });
  const pamRequest = (
    await browserRequest(mfaJar, "/api/identity/pam", {
      method: "POST",
      expected: [201],
      body: {
        action: "request",
        permissions: ["security.events.manage"],
        reason: "Time-bound Phase 8 security administration.",
        requestedMinutes: 15,
      },
    })
  ).data;
  const approverQueue = await browserRequest(
    approverJar,
    "/api/identity/pam",
  );
  assert.ok(
    approverQueue.data.requests.some((request) => request.id === pamRequest.id),
  );
  const approval = await browserRequest(approverJar, "/api/identity/pam", {
    method: "POST",
    body: {
      action: "decide",
      requestId: pamRequest.id,
      decision: "APPROVE",
      note: "Independent approval completed.",
    },
  });
  assert.equal(approval.data.grant.status, "APPROVED");

  await browserRequest(mfaJar, "/api/search?q=phase8");
  await browserRequest(mfaJar, "/api/search?q=phase8");
  const dashboard = await browserRequest(
    mfaJar,
    "/api/observability/dashboard",
  );
  assert.equal(
    dashboard.data.health.cache.strategy,
    "redis-primary-local-lru-fallback",
  );
  assert.ok(dashboard.data.health.cache.consecutiveFailures >= 1);
  await browserRequest(mfaJar, "/api/observability/dashboard", {
    method: "POST",
    expected: [201],
    body: {
      action: "slo.upsert",
      key: "phase8-runtime-availability",
      name: "Phase 8 runtime availability",
      indicatorType: "AVAILABILITY",
      service: "web",
      target: 0.95,
      window: "ROLLING_1H",
    },
  });
  const measurements = await browserRequest(
    mfaJar,
    "/api/observability/dashboard",
    { method: "POST", expected: [201], body: { action: "slo.evaluate" } },
  );
  assert.equal(measurements.data.length, 1);
  const destination = (
    await browserRequest(mfaJar, "/api/observability/dashboard", {
      method: "POST",
      expected: [201],
      body: {
        action: "auditDestination.create",
        name: "Phase 8 signed audit sink",
        type: "WEBHOOK",
        endpoint: `${providerUrl}/sink`,
        secret: `${randomUUID()}${randomUUID()}`,
      },
    })
  ).data;
  const exportRun = await browserRequest(
    mfaJar,
    "/api/observability/dashboard",
    {
      method: "POST",
      expected: [202],
      body: {
        action: "auditExport.run",
        destinationId: destination.id,
      },
    },
  );
  assert.equal(exportRun.data.status, "SUCCEEDED");
  assert.ok(sinkPayloads.some((payload) => payload.body.schema === "dublancer.audit.v1"));
  assert.ok(sinkPayloads.some((payload) => payload.signature?.startsWith("sha256=")));

  await browserRequest(mfaJar, "/api/observability/dashboard", {
    method: "POST",
    expected: [201],
    body: {
      action: "scalingPolicy.upsert",
      queue: "phase8-runtime",
      minWorkers: 1,
      maxWorkers: 4,
      targetJobsPerWorker: 10,
      targetOldestJobAgeMs: 1_000,
    },
  });
  const recommendations = await browserRequest(
    mfaJar,
    "/api/observability/dashboard",
    { method: "POST", expected: [201], body: { action: "scaling.evaluate" } },
  );
  assert.equal(recommendations.data[0].desiredWorkers, 1);
  const loadTest = (
    await browserRequest(mfaJar, "/api/observability/dashboard", {
      method: "POST",
      expected: [201],
      body: {
        action: "loadTest.plan",
        name: "Phase 8 bounded smoke",
        targetUrl: `${baseUrl}/api/health/live`,
        scenario: "health-smoke",
        concurrency: 2,
        durationSeconds: 1,
      },
    })
  ).data;
  const completedLoadTest = await browserRequest(
    null,
    "/api/internal/observability/evaluate",
    {
      method: "POST",
      csrf: false,
      expected: [202],
      headers: { authorization: `Bearer ${internalWorkerSecret}` },
      body: {
        action: "COMPLETE_LOAD_TEST",
        runId: loadTest.id,
        status: "PASSED",
        requests: 10,
        failures: 0,
        p95LatencyMs: 25,
      },
    },
  );
  assert.equal(completedLoadTest.data.status, "PASSED");

  const metrics = await fetch(`${baseUrl}/api/observability/metrics`, {
    headers: { authorization: `Bearer ${observabilityExportSecret}` },
  });
  assert.equal(metrics.status, 200);
  const metricsText = await metrics.text();
  assert.match(metricsText, /dublancer_http_responses_total/);
  assert.match(metricsText, /dublancer_cache_failover_total/);
  const readiness = await fetch(`${baseUrl}/api/health/ready`);
  assert.equal(readiness.status, 503);
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.status, "unhealthy");
  assert.equal(readinessBody.checks.database.status, "healthy");
  assert.equal(readinessBody.checks.redis.status, "unhealthy");
  assert.equal(readinessBody.checks.queue.status, "healthy");
  assert.doesNotMatch(JSON.stringify(readinessBody), /postgresql:\/\/|redis:\/\/|stack|exception/i);

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        migrations: migrations.length,
        oidcSsoAndJit: "verified",
        mfaAndBackupCode: "verified",
        sessionLifecycle: "verified",
        scimProvisioning: "verified",
        privilegedAccess: "verified",
        tenantIsolation: "verified",
        redisOutageReadiness: "structured 503 verified",
        cacheFailover: "verified",
        metricsTracingHealthSlo: "verified",
        auditExportAndScaling: "verified",
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
  console.error(error);
  if (nextLogs.length) {
    console.error(nextLogs.slice(-80).join(""));
  }
} finally {
  try {
    await cleanupRuntime({
      root, baseline: runtimeBaseline, children,
      close: [
        () => provider ? new Promise((resolve) => provider.close(resolve)) : Promise.resolve(),
        () => prisma?.$disconnect(), () => socketServer?.stop(), () => pglite?.close(),
      ],
      paths: [temporary, path.join(root, ".next")],
    });
  } catch (error) { failure ??= error; console.error(error); }
}
if (failure) process.exitCode = 1;
