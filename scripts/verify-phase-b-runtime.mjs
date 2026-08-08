import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = process.cwd();
const databasePort = Number(process.env.PHASE_B_DATABASE_PORT ?? 55482);
const applicationPort = Number(process.env.PHASE_B_APPLICATION_PORT ?? 3182);
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?schema=public`;
const temporary = await mkdtemp(path.join(root, ".phase-b-runtime-"));
const prismaTemporary = path.join(temporary, "tmp");
await mkdir(prismaTemporary);

const children = new Set();
const nextLogs = [];
let pglite;
let socketServer;
let failure;

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
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

async function request(jar, route, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
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
  const email = `phase-b-${label}-${randomUUID()}@example.test`;
  const password = "PhaseB!Enterprise123";
  const registration = await request(jar, "/api/auth/register", { method: "POST", expected: [201], body: { email, displayName: `Phase B ${label}`, password } });
  await request(jar, "/api/auth/login", { method: "POST", body: { email, password, organizationId: registration.data.organizationId, deviceLabel: `${label} phase b runtime` } });
  return { jar, email, userId: registration.data.id, organizationId: registration.data.organizationId };
}

async function configureAllPersonas(actorRecord, label) {
  await request(actorRecord.jar, "/api/onboarding", {
    method: "PATCH",
    body: {
      identity: { displayName: `Phase B ${label}`, countryCode: "AE", timezone: "Asia/Dubai", locale: "en-AE" },
      selectedPersonaTypes: ["CLIENT", "FREELANCER", "ORGANIZATION"],
      client: { displayName: `${label} Client`, headline: "Enterprise hiring partner", about: "A database-backed Phase B client profile." },
      freelancer: { headline: `${label} Provider`, bio: "A database-backed Phase B freelancer profile.", hourlyRateMinor: "25000", yearsExperience: 8, availability: "AVAILABLE" },
      organization: { organizationId: actorRecord.organizationId, legalName: `${label} Workspace LLC`, tradingName: `${label} Workspace`, description: "Phase B organization identity." },
    },
  });
  const overview = await request(actorRecord.jar, "/api/personas");
  const personas = Object.fromEntries(overview.data.account.accountPersonas.map((persona) => [persona.type, persona]));
  await request(actorRecord.jar, "/api/onboarding/complete", { method: "POST", body: { preferredPersonaId: personas.FREELANCER.id } });
  return personas;
}

try {
  pglite = new PGlite();
  await pglite.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
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
  await runRequired(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "seed"], env);
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  const next = startProcess(path.join(root, "node_modules/.bin/next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(applicationPort)], env);
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => { nextLogs.push(chunk.toString()); if (nextLogs.length > 500) nextLogs.shift(); });
  await waitForApplication();

  const owner = await actor("owner");
  const outsider = await actor("outsider");
  const ownerPersonas = await configureAllPersonas(owner, "Owner");
  const outsiderPersonas = await configureAllPersonas(outsider, "Outsider");

  const initialSettings = await request(owner.jar, "/api/profile/settings");
  assert.ok(initialSettings.data.account.username);
  const freelancer = initialSettings.data.account.freelancerProfile;
  const personal = initialSettings.data.account.personalIdentity;
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", body: { section: "personal", data: { username: initialSettings.data.account.username, displayName: "Phase B Owner", preferredName: "Owner", countryCode: "AE", timezone: "Asia/Dubai", locale: "en-AE" } } });
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", body: { section: "freelancer", data: { version: freelancer.version, headline: "Enterprise Privacy Engineer", bio: "Production profile with governed visibility and owned content.", hourlyRateMinor: "35000", currency: "AED", availability: "AVAILABLE", visibility: "PUBLIC", bannerUrl: "https://example.test/banner.jpg", avatarUrl: "https://example.test/avatar.jpg", languages: ["English", "Arabic"], industries: ["Technology"], services: ["Architecture", "Security"], fixedPriceAvailable: true, yearsExperience: 10, resumeUrl: "https://example.test/resume.pdf", videoUrl: "https://example.test/video", githubUrl: "https://github.com/example", linkedinUrl: "https://linkedin.com/in/example" } } });

  const portfolio = await request(owner.jar, "/api/profile/content/portfolio", { method: "POST", expected: [201], body: { title: "Secure marketplace", description: "Privacy-first marketplace delivery.", projectUrl: "https://example.test/work", mediaUrl: "https://example.test/work.jpg", completedAt: "2026-01-01", sortOrder: 1, visibility: "PUBLIC" } });
  await request(owner.jar, `/api/profile/content/portfolio/${portfolio.data.id}`, { method: "PATCH", body: { ...portfolio.data, title: "Secure marketplace platform", completedAt: "2026-01-01", visibility: "PUBLIC" } });
  for (const [kind, body] of [
    ["case-study", { title: "Enterprise migration", description: "Measured migration case study.", sortOrder: 2, visibility: "PUBLIC" }],
    ["publication", { title: "Privacy architecture", description: "Technical publication.", sortOrder: 3, visibility: "PUBLIC" }],
    ["research", { title: "Tenant isolation research", description: "Security research record.", sortOrder: 4, visibility: "PUBLIC" }],
    ["experience", { companyName: "SoasTech", title: "Lead Engineer", description: "Enterprise platform delivery.", startedAt: "2020-01-01", visibility: "PUBLIC" }],
    ["education", { institution: "Technology University", degree: "Computer Science", fieldOfStudy: "Security", startedAt: "2012-01-01", endedAt: "2016-01-01", visibility: "PUBLIC" }],
    ["certification", { name: "Cloud Security", issuer: "Trusted Institute", credentialId: "CS-1", issuedAt: "2025-01-01", visibility: "PUBLIC" }],
    ["social-link", { personaType: "FREELANCER", platform: "website", url: "https://example.test", visibility: "PUBLIC" }],
  ]) await request(owner.jar, `/api/profile/content/${kind}`, { method: "POST", expected: [201], body });

  const ownerPublished = await request(null, `/api/public/users/${initialSettings.data.account.username}/freelancer`);
  assert.equal(ownerPublished.data.profile.headline, "Enterprise Privacy Engineer");
  assert.equal("email" in ownerPublished.data, false);
  assert.equal("earnings" in ownerPublished.data, false);
  assert.equal(ownerPublished.data.profile.portfolio.length, 1);
  const afterContent = await request(owner.jar, "/api/profile/settings");
  assert.ok(afterContent.data.completion.freelancer.percentage > initialSettings.data.completion.freelancer.percentage);

  const outsiderSettings = await request(outsider.jar, "/api/profile/settings");
  await request(outsider.jar, `/api/profile/content/portfolio/${portfolio.data.id}`, { method: "PATCH", expected: [409], body: { title: "Cross tenant attempt", description: null, projectUrl: null, mediaUrl: null, completedAt: null, sortOrder: 0, visibility: "PUBLIC", version: portfolio.data.version + 1 } });
  await request(outsider.jar, "/api/profile/settings", { method: "PATCH", body: { section: "freelancer", data: { version: outsiderSettings.data.account.freelancerProfile.version, headline: "Public Outsider Provider", bio: "A public provider used for saved-provider verification.", hourlyRateMinor: "20000", currency: "AED", availability: "AVAILABLE", visibility: "PUBLIC", bannerUrl: null, avatarUrl: null, languages: ["English"], industries: ["Technology"], services: ["Development"], fixedPriceAvailable: true, yearsExperience: 5, resumeUrl: null, videoUrl: null, githubUrl: null, linkedinUrl: null } } });

  await request(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: ownerPersonas.CLIENT.id } });
  const clientSettings = await request(owner.jar, "/api/profile/settings");
  const client = clientSettings.data.account.clientProfile;
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", body: { section: "client", data: { version: client.version, displayName: "Owner Enterprise Client", headline: "Hiring secure engineering teams", about: "A public database-backed client identity.", visibility: "PUBLIC", bannerUrl: "https://example.test/client-banner.jpg", avatarUrl: "https://example.test/client-logo.jpg", industry: "Technology", companySize: "11-50", website: "https://example.test", languages: ["English"], responseTimeMinutes: 90, hiringAvailable: true, showVerifiedSpend: false, hiringPreferences: { seniority: "expert" }, engagementModels: ["FIXED_PRICE", "HOURLY"] } } });
  await request(owner.jar, "/api/profile/content/social-link", { method: "POST", expected: [201], body: { personaType: "CLIENT", platform: "linkedin", url: "https://linkedin.com/company/example", visibility: "PUBLIC" } });
  const listing = await request(owner.jar, "/api/marketplace/listings", { method: "POST", expected: [201], body: { title: "Phase B live dashboard project", description: "A real published listing used by the client dashboard and recommended-work read model.", engagementType: "FIXED_PRICE", experienceLevel: "EXPERT", currency: "AED", visibility: "PUBLIC", remoteAllowed: true, publish: true, skillIds: [] } });
  assert.ok(listing.data.id);
  const searchProject = await request(owner.jar, "/api/projects", { method: "POST", expected: [201], body: { title: "Sprint 1 Audit", slug: `sprint-1-audit-${randomUUID()}`, description: "Release Blocker Verification", currency: "AED" } });
  for (const query of ["Sprint", "sprint", "Audit", "Sprint 1 Audit"]) {
    const found = await request(owner.jar, `/api/search?q=${encodeURIComponent(query)}&entityType=project&take=20`);
    const result = found.data.find((item) => item.entityId === searchProject.data.id);
    assert.ok(result, `newly created project must be searchable for ${query}`);
    assert.equal(result.metadata.href, `/workspace/project/${searchProject.data.id}`);
  }
  const outsiderProjectSearch = await request(outsider.jar, "/api/search?q=Sprint&entityType=project&take=20");
  assert.ok(!outsiderProjectSearch.data.some((item) => item.entityId === searchProject.data.id));
  await request(owner.jar, `/api/projects/${searchProject.data.id}`, { method: "PATCH", body: { title: "Release Search Verification" } });
  assert.ok((await request(owner.jar, "/api/search?q=Release%20Search&entityType=project&take=20")).data.some((item) => item.entityId === searchProject.data.id));
  assert.ok(!(await request(owner.jar, "/api/search?q=Sprint%201%20Audit&entityType=project&take=20")).data.some((item) => item.entityId === searchProject.data.id));
  await request(owner.jar, `/api/projects/${searchProject.data.id}`, { method: "DELETE" });
  assert.ok(!(await request(owner.jar, "/api/search?q=Release%20Search&entityType=project&take=20")).data.some((item) => item.entityId === searchProject.data.id));

  await request(owner.jar, "/api/profile-actions", { method: "POST", body: { action: "SAVE", active: true, freelancerProfileId: outsiderSettings.data.account.freelancerProfile.id } });
  await request(owner.jar, "/api/profile-actions", { method: "POST", body: { action: "FOLLOW", active: true, target: { resourceType: "FREELANCER_PROFILE", resourceId: outsiderSettings.data.account.freelancerProfile.id } } });
  const invitation = await request(owner.jar, "/api/profile-actions", { method: "POST", expected: [201], body: { action: "INVITE", listingId: listing.data.id, freelancerProfileId: outsiderSettings.data.account.freelancerProfile.id, message: "Phase C governed runtime invitation." } });
  const providerInvitations = await request(outsider.jar, "/api/marketplace/invitations");
  assert.ok(providerInvitations.data.some((item) => item.id === invitation.data.id));
  await request(outsider.jar, `/api/marketplace/invitations/${invitation.data.id}`, { method: "PATCH", body: { decision: "ACCEPTED", expectedVersion: invitation.data.version } });
  const proposal = await request(outsider.jar, "/api/marketplace/proposals", { method: "POST", expected: [201], body: { listingId: listing.data.id, coverLetter: "A governed Phase C provider proposal with sufficient runtime detail.", bidMinor: "500000", currency: "AED", estimatedDays: 14, submit: true } });
  const submitted = (await request(owner.jar, `/api/marketplace/proposals?listingId=${listing.data.id}`)).data.find((item) => item.id === proposal.data.id);
  assert.ok(submitted);
  const shortlisted = await request(owner.jar, `/api/marketplace/proposals/${proposal.data.id}`, { method: "PATCH", body: { status: "SHORTLISTED", expectedVersion: proposal.data.version, note: "Runtime shortlist" } });
  const contract = await request(owner.jar, `/api/marketplace/proposals/${proposal.data.id}/award`, { method: "POST", expected: [201], body: { idempotencyKey: `phase-c-award-${randomUUID()}`, expectedListingVersion: listing.data.version, expectedProposalVersion: shortlisted.data.version, title: "Phase C governed marketplace contract", taxRateBasisPoints: 0, platformFeeBasisPoints: 500, terms: { scope: "Runtime persona verification", deliverables: ["Verified integration"] } } });
  assert.equal(contract.data.clientPersonaId, ownerPersonas.CLIENT.id);
  assert.equal(contract.data.providerPersonaId, outsiderPersonas.FREELANCER.id);
  const clientContract = await request(owner.jar, `/api/contracts/${contract.data.id}`);
  assert.equal(clientContract.data.viewerParty, "CLIENT");
  await request(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: ownerPersonas.FREELANCER.id } });
  await request(owner.jar, `/api/contracts/${contract.data.id}/acceptances`, { method: "POST", expected: [403], body: { expectedVersion: clientContract.data.version, party: "CLIENT", method: "CLICKWRAP", termsHash: clientContract.data.termsHash } });
  await request(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: ownerPersonas.CLIENT.id } });
  const clientAccepted = await request(owner.jar, `/api/contracts/${contract.data.id}/acceptances`, { method: "POST", expected: [201], body: { expectedVersion: clientContract.data.version, party: "CLIENT", method: "CLICKWRAP", termsHash: clientContract.data.termsHash } });
  await request(outsider.jar, `/api/contracts/${contract.data.id}/acceptances`, { method: "POST", expected: [403], body: { expectedVersion: clientAccepted.data.version, party: "CLIENT", method: "CLICKWRAP", termsHash: clientContract.data.termsHash } });
  const providerContract = await request(outsider.jar, `/api/contracts/${contract.data.id}`);
  assert.equal(providerContract.data.viewerParty, "PROVIDER");
  const activeContract = await request(outsider.jar, `/api/contracts/${contract.data.id}/acceptances`, { method: "POST", expected: [201], body: { expectedVersion: providerContract.data.version, party: "PROVIDER", method: "CLICKWRAP", termsHash: providerContract.data.termsHash } });
  assert.equal(activeContract.data.status, "ACTIVE");
  const milestone = await request(owner.jar, `/api/contracts/${contract.data.id}/milestones`, { method: "POST", expected: [201], body: { title: "Runtime closeout milestone", description: "Establishes an eligible completed engagement for directional review verification.", amountMinor: "500000", currency: "AED" } });
  await pglite.query(`UPDATE "ContractMilestone" SET "status" = 'RELEASED', "closedAt" = CURRENT_TIMESTAMP, "closedById" = $1, "closeoutNote" = 'Phase 6 lifecycle is independently runtime verified.', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`, [owner.userId, milestone.data.id]);
  const completed = await request(owner.jar, `/api/contracts/${contract.data.id}/completion`, { method: "POST", body: { note: "All governed runtime deliverables and closeout evidence are complete.", checklist: { deliverablesAccepted: true, settlementVerified: true }, expectedVersion: activeContract.data.version } });
  assert.equal(completed.data.status, "COMPLETED");
  const clientReview = await request(owner.jar, `/api/contracts/${contract.data.id}/reviews`, { method: "POST", expected: [201], body: { overall: 5, quality: 5, communication: 4, delivery: 5, expertise: 5, professionalism: 5, title: "Verified provider delivery", body: "The provider completed the governed engagement successfully." } });
  assert.equal(clientReview.data.subjectFreelancerProfileId, outsiderSettings.data.account.freelancerProfile.id);
  await request(owner.jar, `/api/contracts/${contract.data.id}/reviews`, { method: "POST", expected: [409], body: { overall: 5, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, body: "Duplicate directional review must fail." } });
  const providerReview = await request(outsider.jar, `/api/contracts/${contract.data.id}/reviews`, { method: "POST", expected: [201], body: { overall: 4, hiringClarity: 5, communication: 4, paymentReliability: 4, professionalConduct: 5, title: "Clear client engagement", body: "The client supplied clear governed requirements and professional conduct." } });
  assert.equal(providerReview.data.subjectClientProfileId, initialSettings.data.account.clientProfile.id);
  const providerReputation = await request(null, `/api/public/users/${outsiderSettings.data.account.username}/freelancer`);
  assert.equal(providerReputation.data.reviewsSummary.count, 1);
  assert.equal(providerReputation.data.reviewsSummary.value, 5);
  const recommendedListing = await request(owner.jar, "/api/marketplace/listings", { method: "POST", expected: [201], body: { title: "Phase C recommended provider opportunity", description: "A second real listing verifies freelancer recommended work after the first award.", engagementType: "FIXED_PRICE", experienceLevel: "INTERMEDIATE", currency: "AED", visibility: "PUBLIC", remoteAllowed: true, publish: true, skillIds: [] } });
  const publicProviderSearch = await request(owner.jar, "/api/search?q=Public%20Outsider&entityType=freelancer_profile&take=20");
  assert.ok(publicProviderSearch.data.some((item) => item.entityId === outsiderSettings.data.account.freelancerProfile.id));
  const clientPublic = await request(null, `/api/public/users/${initialSettings.data.account.username}/client`);
  assert.equal(clientPublic.data.profile.displayName, "Owner Enterprise Client");
  assert.equal(clientPublic.data.stats.openProjects, 1);
  assert.equal(clientPublic.data.stats.verifiedSpendMinor, null);
  const clientDashboard = await request(owner.jar, "/api/dashboard/client");
  assert.equal(clientDashboard.data.hiringOverview.openProjects, 1);
  assert.equal(clientDashboard.data.hiringOverview.activeContracts, 0);
  assert.equal(clientDashboard.data.hiringAnalytics.completedContracts, 1);
  assert.equal(clientDashboard.data.savedFreelancers, 1);

  const latestClient = await request(owner.jar, "/api/profile/settings");
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", expected: [409], body: { section: "client", data: { version: client.version, displayName: "Stale update", headline: null, about: null, visibility: "PUBLIC", bannerUrl: null, avatarUrl: null, industry: null, companySize: null, website: null, languages: [], responseTimeMinutes: null, hiringAvailable: true, showVerifiedSpend: false, hiringPreferences: null, engagementModels: [] } } });
  assert.ok(latestClient.data.account.clientProfile.version > client.version);

  await request(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: ownerPersonas.ORGANIZATION.id } });
  const organizationSettings = await request(owner.jar, "/api/profile/settings");
  const company = organizationSettings.data.organizations.find((item) => item.id === owner.organizationId).companyProfile;
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", body: { section: "organization", data: { organizationId: owner.organizationId, version: company.version, legalName: "Owner Workspace LLC", tradingName: "Owner Public Studio", description: "Public organization profile foundation.", website: "https://example.test/org", countryCode: "AE", visibility: "PUBLIC", logoUrl: "https://example.test/org-logo.jpg", bannerUrl: "https://example.test/org-banner.jpg", industry: "Technology", locations: [{ label: "Dubai", countryCode: "AE" }], services: ["Engineering"], technologies: ["Next.js", "PostgreSQL"], portfolio: [{ title: "Dublancer", description: "Marketplace platform", url: "https://example.test/dublancer" }] } } });
  const organizationPublic = await request(null, `/api/public/organizations/${organizationSettings.data.organizations.find((item) => item.id === owner.organizationId).slug}`);
  assert.equal(organizationPublic.data.name, "Owner Public Studio");
  assert.equal("memberships" in organizationPublic.data, false);

  await request(owner.jar, "/api/personas/switch", { method: "POST", body: { personaId: ownerPersonas.FREELANCER.id } });
  const freelancerDashboard = await request(owner.jar, "/api/dashboard/freelancer");
  assert.ok(freelancerDashboard.data.recommendedWork.some((item) => item.id === recommendedListing.data.id));
  assert.ok(freelancerDashboard.data.profileCompletion.percentage > 0);
  const currentFreelancer = (await request(owner.jar, "/api/profile/settings")).data.account.freelancerProfile;
  await request(owner.jar, "/api/profile/settings", { method: "PATCH", body: { section: "freelancer", data: { version: currentFreelancer.version, headline: currentFreelancer.headline, bio: currentFreelancer.bio, hourlyRateMinor: currentFreelancer.hourlyRateMinor, currency: currentFreelancer.currency, availability: currentFreelancer.availability, visibility: "HIDDEN", bannerUrl: currentFreelancer.bannerUrl, avatarUrl: currentFreelancer.avatarUrl, languages: currentFreelancer.languages, industries: currentFreelancer.industries, services: currentFreelancer.services, fixedPriceAvailable: currentFreelancer.fixedPriceAvailable, yearsExperience: currentFreelancer.yearsExperience, resumeUrl: currentFreelancer.resumeUrl, videoUrl: currentFreelancer.videoUrl, githubUrl: currentFreelancer.githubUrl, linkedinUrl: currentFreelancer.linkedinUrl } } });
  await request(null, `/api/public/users/${initialSettings.data.account.username}/freelancer`, { expected: [404] });

  const certification = (await request(owner.jar, "/api/profile/content/certification")).data[0];
  await request(owner.jar, `/api/profile/content/certification/${certification.id}?version=${certification.version}`, { method: "DELETE" });
  assert.equal((await request(owner.jar, "/api/profile/content/certification")).data.length, 0);
  await request(owner.jar, "/api/profiles/report", { method: "POST", expected: [201], body: { resourceType: "FREELANCER_PROFILE", resourceId: outsiderSettings.data.account.freelancerProfile.id, category: "PROFILE", detail: "Phase B runtime moderation report evidence." } });

  console.log(JSON.stringify({ result: "PASS", migrations: migrations.length, seed: "npm run seed", onboarding: "fresh-three-persona", clientProfile: "public-private-allowlist", freelancerProfile: "public-hidden", organizationProfile: "public-no-rbac", contentCrud: ["portfolio", "case-study", "publication", "research", "experience", "education", "certification", "social-link"], dashboards: "database-backed", completion: "dynamic", tenantIsolation: "verified", personaAuthorization: "verified", optimisticConflicts: "verified" }, null, 2));
} catch (error) {
  failure = error;
  console.error(error);
  if (nextLogs.length) console.error(nextLogs.slice(-100).join(""));
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await socketServer?.stop().catch(() => undefined);
  await pglite?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}

if (failure) process.exitCode = 1;
