import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const databasePort = Number(process.env.PHASE6_DATABASE_PORT ?? 55436);
const applicationPort = Number(process.env.PHASE6_APPLICATION_PORT ?? 3113);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase6-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);
const children = new Set();
const nextLogs = [];

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) { const first = value.split(";", 1)[0]; const index = first.indexOf("="); if (index > 0) this.cookies.set(first.slice(0, index), first.slice(index + 1)); }
  }
  header(extra) { return [...this.cookies, ...(extra ? Object.entries(extra) : [])].map(([key, value]) => `${key}=${value}`).join("; "); }
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child); child.once("exit", () => children.delete(child)); return child;
}
function runRequired(command, args, env) { return new Promise((resolve, reject) => { const child = startProcess(command, args, { env }); let output = ""; child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); }); child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed:\n${output}`))); }); }
async function waitForPort(port, timeout = 30_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { const open = await new Promise((resolve) => { const socket = net.createConnection({ host: "127.0.0.1", port }); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); socket.setTimeout(300, () => { socket.destroy(); resolve(false); }); }); if (open) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`Timed out waiting for port ${port}.`); }
async function waitForApplication() { const deadline = Date.now() + 90_000; while (Date.now() < deadline) { try { if ((await fetch(`${baseUrl}/api/auth/csrf`)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Application did not become ready.\n${nextLogs.slice(-40).join("")}`); }

async function request(jar, route, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
  let token;
  if (csrf) { const bootstrap = await fetch(`${baseUrl}/api/auth/csrf`, { headers: jar?.header() ? { cookie: jar.header() } : {} }); jar?.absorb(bootstrap); const envelope = await bootstrap.json(); assert.equal(bootstrap.status, 200); token = envelope.data.csrfToken; }
  const response = await fetch(`${baseUrl}${route}`, { method, redirect: "manual", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { "x-csrf-token": token } : {}), ...(jar?.header() ? { cookie: jar.header() } : {}), origin: baseUrl }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  jar?.absorb(response); const envelope = await response.json().catch(() => ({})); assert.ok(expected.includes(response.status), `${method} ${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`); return { status: response.status, data: envelope.data, error: envelope.error };
}
async function actor(label) { const jar = new CookieJar(); const email = `phase6-${label}-${randomUUID()}@example.test`; const password = "Phase6!Enterprise123"; const registration = await request(jar, "/api/auth/register", { method: "POST", expected: [201], body: { email, displayName: `Phase 6 ${label}`, password } }); await request(jar, "/api/auth/login", { method: "POST", body: { email, password, organizationId: registration.data.organizationId } }); return { jar, email, password, userId: registration.data.id, organizationId: registration.data.organizationId }; }
async function loginToOrganization(row, organizationId) { await request(row.jar, "/api/auth/login", { method: "POST", body: { email: row.email, password: row.password, organizationId } }); }

let pglite; let socketServer; let prisma; let failure;
try {
  pglite = new PGlite(); await pglite.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migration of migrations) { await pglite.exec(await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8")); process.stdout.write(`Applied migration ${migration}\n`); }
  socketServer = new PGLiteSocketServer({ db: pglite, port: databasePort, host: "127.0.0.1", maxConnections: 40 }); await socketServer.start(); await waitForPort(databasePort);
  const memoryShim = path.join(temporary, "memory-shim.cjs");
  await writeFile(memoryShim, `const original=process.memoryUsage;function empty(){return{rss:0,heapTotal:0,heapUsed:0,external:0,arrayBuffers:0}}function safe(){try{return original()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return empty();throw error}}safe.rss=()=>{try{return original.rss()}catch(error){if(error&&error.syscall==="uv_resident_set_memory")return 0;throw error}};process.memoryUsage=safe;`, "utf8");
  const env = { DATABASE_URL: databaseUrl, APP_BASE_URL: baseUrl, REDIS_URL: "redis://127.0.0.1:6396", AUTH_SECRET: `${randomUUID()}${randomUUID()}`, INTERNAL_PUBLISHER_SECRET: `${randomUUID()}${randomUUID()}`, INTERNAL_NOTIFICATION_SECRET: `${randomUUID()}${randomUUID()}`, INTERNAL_CHAT_MAINTENANCE_SECRET: `${randomUUID()}${randomUUID()}`, INTERNAL_WORKER_SECRET: `${randomUUID()}${randomUUID()}`, PAYMENT_PROVIDER_BASE_URL: "http://127.0.0.1:4199", PAYMENT_PROVIDER_API_KEY: `${randomUUID()}${randomUUID()}`, PAYMENT_WEBHOOK_SECRET: `${randomUUID()}${randomUUID()}`, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", TMPDIR: prismaTemporary, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${memoryShim}`.trim() };
  await runRequired(process.execPath, ["prisma/seed.mjs"], env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(path.join(root, "node_modules/.bin/next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)], { env });
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => { nextLogs.push(chunk.toString()); if (nextLogs.length > 400) nextLogs.shift(); });
  await waitForApplication();

  const client = await actor("client"); const provider = await actor("provider"); const manager = await actor("manager"); const contributor = await actor("contributor"); const outsider = await actor("outsider");
  const managerRole = await prisma.role.findFirstOrThrow({ where: { organizationId: client.organizationId, name: "Manager" } });
  const memberRole = await prisma.role.findFirstOrThrow({ where: { organizationId: client.organizationId, name: "Member" } });
  await prisma.membership.createMany({ data: [{ organizationId: client.organizationId, userId: manager.userId, roleId: managerRole.id, status: "ACTIVE" }, { organizationId: client.organizationId, userId: contributor.userId, roleId: memberRole.id, status: "ACTIVE" }] });
  await loginToOrganization(manager, client.organizationId); await loginToOrganization(contributor, client.organizationId);

  const project = (await request(client.jar, "/api/projects", { method: "POST", expected: [201], body: { title: "Phase 6 delivery project", slug: `phase6-${randomUUID()}`, description: "Advanced delivery runtime verification.", currency: "AED" } })).data;
  await request(client.jar, `/api/projects/${project.id}/members`, { method: "POST", expected: [201], body: { userId: manager.userId, role: "MANAGER" } });
  await request(client.jar, `/api/projects/${project.id}/members`, { method: "POST", expected: [201], body: { userId: contributor.userId, role: "CONTRIBUTOR" } });
  const taskA = (await request(client.jar, `/api/projects/${project.id}/tasks`, { method: "POST", expected: [201], body: { title: "Predecessor task", status: "DONE", priority: "HIGH", position: 0 } })).data;
  const taskB = (await request(client.jar, `/api/projects/${project.id}/tasks`, { method: "POST", expected: [201], body: { title: "Successor task", status: "DONE", priority: "MEDIUM", position: 1 } })).data;

  const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "timeEntry", taskId: taskA.id, startedAt: startedAt.toISOString(), durationMinutes: 90, description: "Verified delivery work.", billable: true } });
  let timesheet = (await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "timesheet", periodStart: new Date(startedAt.getTime() - 86400000).toISOString(), periodEnd: new Date(startedAt.getTime() + 86400000).toISOString() } })).data;
  timesheet = (await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "timesheet", id: timesheet.id, action: "SUBMIT", expectedVersion: timesheet.version } })).data;
  await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", expected: [403], body: { type: "timesheet", id: timesheet.id, action: "APPROVE", note: "Self approval denied.", expectedVersion: timesheet.version } });
  timesheet = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "timesheet", id: timesheet.id, action: "APPROVE", note: "Time evidence reviewed.", expectedVersion: timesheet.version } })).data;
  timesheet = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "timesheet", id: timesheet.id, action: "LOCK", expectedVersion: timesheet.version } })).data;
  assert.equal(timesheet.status, "LOCKED");

  let deliverable = (await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "deliverable", taskId: taskB.id, title: "Production delivery", description: "Complete governed delivery." } })).data;
  deliverable = (await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "deliverable", id: deliverable.id, action: "SUBMIT", expectedVersion: deliverable.version } })).data;
  deliverable = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "deliverable", id: deliverable.id, action: "ACCEPT", note: "Accepted.", expectedVersion: deliverable.version } })).data;
  assert.equal(deliverable.status, "ACCEPTED");

  await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [403], body: { type: "dependency", predecessorTaskId: taskA.id, successorTaskId: taskB.id, dependencyType: "FINISH_TO_START", lagMinutes: 0 } });
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "dependency", predecessorTaskId: taskA.id, successorTaskId: taskB.id, dependencyType: "FINISH_TO_START", lagMinutes: 0 } });
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [409], body: { type: "dependency", predecessorTaskId: taskB.id, successorTaskId: taskA.id, dependencyType: "FINISH_TO_START", lagMinutes: 0 } });

  let issue = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "issue", title: "Runtime issue", severity: "HIGH" } })).data;
  issue = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "issue", id: issue.id, status: "RESOLVED", resolution: "Verified fix.", expectedVersion: issue.version } })).data;
  issue = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "issue", id: issue.id, status: "CLOSED", resolution: "Verified fix.", expectedVersion: issue.version } })).data;
  let risk = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "risk", title: "Runtime risk", severity: "CRITICAL", probability: 70, impact: 80, mitigation: "Mitigate now." } })).data;
  risk = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "risk", id: risk.id, status: "CLOSED", mitigation: "Mitigated.", expectedVersion: risk.version } })).data;
  let change = (await request(contributor.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "changeRequest", title: "Governed scope change", description: "Add verified Phase 6 evidence.", submit: true } })).data;
  change = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "changeRequest", id: change.id, action: "APPROVE", note: "Impact reviewed.", expectedVersion: change.version } })).data;
  change = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "changeRequest", id: change.id, action: "IMPLEMENT", note: "Implemented.", expectedVersion: change.version } })).data;
  const allocationStart = new Date(Date.now() - 86400000).toISOString();
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "resourceAllocation", userId: contributor.userId, allocationPercent: 60, startsAt: allocationStart, roleLabel: "Delivery engineer" } });
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [409], body: { type: "resourceAllocation", userId: contributor.userId, allocationPercent: 50, startsAt: new Date(Date.now() - 3600000).toISOString(), roleLabel: "Over allocated" } });
  const template = (await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "template", name: `Phase 6 template ${randomUUID()}`, description: "Reusable delivery plan.", publish: true } })).data;
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "PATCH", body: { type: "template", id: template.id, action: "APPLY", expectedVersion: template.version } });
  await request(manager.jar, `/api/projects/${project.id}/delivery`, { method: "POST", expected: [201], body: { type: "health" } });
  const deliverySummary = await request(manager.jar, `/api/projects/${project.id}/delivery`);
  assert.equal(deliverySummary.data.timesheets[0].status, "LOCKED"); assert.ok(deliverySummary.data.health.current.score >= 0); assert.ok(deliverySummary.data.templates.length >= 1);
  await request(outsider.jar, `/api/projects/${project.id}/delivery`, { expected: [404] });

  const contractProject = await prisma.project.create({ data: { organizationId: client.organizationId, ownerId: client.userId, title: "Contract closeout project", slug: `closeout-${randomUUID()}`, status: "IN_PROGRESS", currency: "AED" } });
  const contract = await prisma.contract.create({ data: { organizationId: client.organizationId, providerOrganizationId: provider.organizationId, providerUserId: provider.userId, projectId: contractProject.id, createdById: client.userId, title: "Phase 6 governed contract", status: "ACTIVE", valueMinor: 250000n, currency: "AED", terms: { scope: "Phase 6" }, signedAt: new Date() } });
  let milestone = await prisma.contractMilestone.create({ data: { contractId: contract.id, title: "Released closeout milestone", amountMinor: 250000n, currency: "AED", status: "RELEASED", releasedAt: new Date() } });
  const amendment = (await request(client.jar, `/api/contracts/${contract.id}/amendments`, { method: "POST", expected: [201], body: { summary: "Extend governed terms", changes: { title: "Phase 6 amended contract", terms: { scope: "Phase 6 amended" } }, submit: true } })).data;
  await request(client.jar, `/api/contracts/${contract.id}/amendments/${amendment.id}/decision`, { method: "PATCH", expected: [403], body: { decision: "ACCEPT", note: "Self decision denied.", expectedAmendmentVersion: amendment.rowVersion, expectedContractVersion: contract.version } });
  let contractView = (await request(provider.jar, `/api/contracts/${contract.id}`)).data;
  contractView = (await request(provider.jar, `/api/contracts/${contract.id}/amendments/${amendment.id}/decision`, { method: "PATCH", body: { decision: "ACCEPT", note: "Counterparty accepted.", expectedAmendmentVersion: amendment.rowVersion, expectedContractVersion: contractView.version } })).data;
  assert.equal(contractView.title, "Phase 6 amended contract");
  let dispute = (await request(provider.jar, `/api/contracts/${contract.id}/disputes`, { method: "POST", expected: [201], body: { category: "DELIVERY", reason: "Evidence requires governed mediation.", evidence: { reference: "runtime" } } })).data;
  dispute = (await request(provider.jar, `/api/contracts/${contract.id}/disputes/${dispute.id}`, { method: "PATCH", body: { status: "EVIDENCE_COLLECTION", note: "Evidence submitted.", evidence: { file: "evidence" }, expectedVersion: dispute.version } })).data;
  dispute = (await request(provider.jar, `/api/contracts/${contract.id}/disputes/${dispute.id}`, { method: "PATCH", body: { status: "MEDIATION", note: "Mediation started.", expectedVersion: dispute.version } })).data;
  dispute = (await request(client.jar, `/api/contracts/${contract.id}/disputes/${dispute.id}`, { method: "PATCH", body: { status: "RESOLVED", note: "Resolution approved.", resolution: { outcome: "accepted" }, expectedVersion: dispute.version } })).data;
  dispute = (await request(client.jar, `/api/contracts/${contract.id}/disputes/${dispute.id}`, { method: "PATCH", body: { status: "CLOSED", note: "Resolution closed.", expectedVersion: dispute.version } })).data;
  assert.equal(dispute.events.length, 5);
  milestone = (await request(client.jar, `/api/contracts/${contract.id}/milestones/${milestone.id}/closeout`, { method: "POST", body: { note: "Payment and evidence reconciled.", expectedVersion: milestone.version } })).data;
  assert.ok(milestone.closedAt);
  contractView = (await request(client.jar, `/api/contracts/${contract.id}`)).data;
  await request(client.jar, `/api/contracts/${contract.id}/completion`, { method: "POST", body: { note: "All contract and delivery obligations are complete.", checklist: { milestoneCloseout: true, deliveryAccepted: true, disputesResolved: true }, expectedVersion: contractView.version } });
  await request(client.jar, `/api/contracts/${contract.id}/reviews`, { method: "POST", expected: [201], body: { rating: 5, title: "Excellent delivery", body: "All governed outcomes were achieved." } });
  await request(provider.jar, `/api/contracts/${contract.id}/reviews`, { method: "POST", expected: [201], body: { rating: 5, title: "Excellent client", body: "Decisions and payments were clear." } });
  const reviews = await request(client.jar, `/api/contracts/${contract.id}/reviews`); assert.equal(reviews.data.length, 2);
  await request(outsider.jar, `/api/contracts/${contract.id}`, { expected: [404] });

  const rtl = await fetch(`${baseUrl}/workspace/project/${project.id}`, { headers: { cookie: client.jar.header({ dublancer_locale: "ar-AE" }) }, redirect: "manual" });
  const rtlHtml = await rtl.text(); assert.equal(rtl.status, 200); assert.match(rtlHtml, /<html[^>]+lang="ar-AE"[^>]+dir="rtl"/); assert.match(rtlHtml, /جارٍ تحميل مساحة العمل/);
  const ltr = await fetch(`${baseUrl}/contracts/${contract.id}`, { headers: { cookie: client.jar.header({ dublancer_locale: "en-AE" }) }, redirect: "manual" });
  const ltrHtml = await ltr.text(); assert.equal(ltr.status, 200); assert.match(ltrHtml, /<html[^>]+lang="en-AE"[^>]+dir="ltr"/);

  console.log(JSON.stringify({ result: "PASS", migrations: migrations.length, contractLifecycle: "verified", amendmentDecision: "counterparty enforced", disputeEvents: dispute.events.length, reviews: reviews.data.length, workspaceDelivery: "verified", timesheetStatus: timesheet.status, tenantIsolation: "verified", permissions: "verified", localization: "en-AE/ar-AE", rtl: "verified" }, null, 2));
} catch (error) { failure = error; console.error(error); } finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await prisma?.$disconnect().catch(() => undefined); await socketServer?.stop().catch(() => undefined); await pglite?.close().catch(() => undefined); await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}
if (failure) process.exitCode = 1;
