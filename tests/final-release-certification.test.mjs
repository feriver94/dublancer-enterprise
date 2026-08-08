import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("real-browser CI provisions native dependencies and executes all four Playwright projects", async () => {
  const workflow = await read(".github/workflows/browser-compatibility.yml");
  for (const project of ["chromium", "firefox", "webkit", "mobile-chrome"]) {
    assert.match(workflow, new RegExp(`project: ${project}`));
  }
  assert.match(workflow, /postgres:18-alpine/);
  assert.match(workflow, /redis:8\.2-alpine/);
  assert.match(workflow, /openssl rand -hex 48/);
  assert.match(workflow, /npm ci --include=dev/);
  assert.match(workflow, /PLAYWRIGHT_BASE_URL=https:\/\/localhost:3443/);
  assert.match(workflow, /https-reverse-proxy\.mjs/);
  assert.match(workflow, /PLAYWRIGHT_IGNORE_HTTPS_ERRORS=true/);
  assert.match(workflow, /npx prisma migrate deploy/);
  assert.match(workflow, /npm run seed/);
  assert.match(workflow, /npm run start/);
  assert.match(workflow, /test:browser -- --project=\$\{\{ matrix\.project \}\}/);
  assert.match(workflow, /Upload browser failure evidence/);
  assert.doesNotMatch(workflow, /dublancer_test:dublancer_test/);
});

test("final certification CI covers production controls, real outages, backup and restore", async () => {
  const workflow = await read(".github/workflows/final-release-certification.yml");
  for (const command of [
    "npm ci",
    "npx prisma validate",
    "npx prisma generate",
    "npx prisma migrate deploy",
    "npm test",
    "npm run typecheck",
    "npm run lint",
    "npm run verify:migrations",
    "npm run verify:locales",
    "npm run verify:security",
    "npm run verify:secrets",
    "npm run verify:production-config",
    "npm run verify:ui",
    "npm run verify:supply-chain",
    "npm run verify:release-docs",
    "npm run audit:production",
    "npm run verify:release",
  ]) assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workflow, /verify:environment -- --profile production/);
  assert.match(workflow, /npm ci --include=dev/);
  assert.match(workflow, /https-reverse-proxy\.mjs/);
  assert.match(workflow, /curl --insecure --fail --silent https:\/\/localhost:3443/);
  assert.match(workflow, /docker stop --time 15 dublancer-release-postgres/);
  assert.match(workflow, /docker stop --time 15 dublancer-release-redis/);
  assert.match(workflow, /pg_dump[\s\S]*--format custom/);
  assert.match(workflow, /openssl enc -aes-256-cbc/);
  assert.match(workflow, /verify:backup/);
  assert.match(workflow, /pg_restore/);
  assert.match(workflow, /verify-restored-auth\.mjs/);
  assert.match(workflow, /Upload encrypted backup evidence/);
});

test("Phase 3 can run unchanged assertions against native PostgreSQL and real Redis", async () => {
  const runtime = await read("scripts/verify-phase3-runtime.mjs");
  assert.match(runtime, /PHASE3_DATABASE_URL/);
  assert.match(runtime, /PHASE3_REDIS_URL/);
  assert.match(runtime, /PHASE3_REDIS_CONTAINER_ID/);
  assert.match(runtime, /Native PostgreSQL must contain exactly the committed migration history/);
  assert.match(runtime, /databaseEngine: externalDatabaseUrl \? "native-postgresql"/);
  assert.match(runtime, /redisEngine: externalRedisUrl \? "real-redis"/);
  assert.match(runtime, /docker", \["stop"/);
  assert.match(runtime, /docker", \["start"/);
});

test("native state, Redis, health and restored-auth verifiers avoid secret output", async () => {
  const native = await read("scripts/verify-native-state.mjs");
  const redis = await read("scripts/verify-real-redis.mjs");
  const health = await read("scripts/verify-health-contract.mjs");
  const restoredAuth = await read("scripts/verify-restored-auth.mjs");
  const proxy = await read("scripts/https-reverse-proxy.mjs");
  assert.match(native, /_prisma_migrations/);
  assert.match(native, /Representative project record is missing|representativeIds/);
  assert.match(redis, /publish\(channel/);
  assert.match(redis, /set\(keys\.rateLimit, "0", "EX", 60\)/);
  assert.match(redis, /rate-limit counters/);
  assert.match(health, /postgresql:\/\//);
  assert.match(health, /\["DATABASE_URL", "REDIS_URL"\]/);
  assert.match(health, /!text\.includes\(value\)/);
  assert.match(restoredAuth, /Restored authentication fixture could not log in/);
  assert.match(proxy, /"x-forwarded-proto": "https"/);
  assert.doesNotMatch(proxy, /console\.log\([^\n]*(key|certificate)/i);
  for (const source of [native, redis, health, restoredAuth, proxy]) {
    assert.doesNotMatch(source, /console\.log\([^\n]*(DATABASE_URL|REDIS_URL|databaseUrl|redisUrl)/);
  }
});

test("real-browser product fixes preserve secure auth, accessible actions, and mobile pricing containment", async () => {
  const config = await read("playwright.config.ts");
  const navbar = await read("src/components/layout/NavbarClient.tsx");
  const button = await read("src/components/ui/Button.tsx");
  const badge = await read("src/components/ui/Badge.tsx");
  const globals = await read("src/app/globals.css");
  const comparison = await read("src/components/pricing/FeatureComparison.tsx");
  const cta = await read("src/components/sections/CTA.tsx");
  const marketplace = await read("src/components/marketplace/MarketplaceClient.tsx");
  const browserJourney = await read("tests/browser/authenticated-release.spec.ts");
  assert.match(config, /PLAYWRIGHT_IGNORE_HTTPS_ERRORS/);
  assert.match(config, /ignoreHTTPSErrors/);
  assert.match(navbar, /bg-\[#007A36\][^\n]*hover:bg-\[#00612B\][^\n]*labels\.startFree/);
  assert.match(button, /bg-\[#007A36\][^\n]*hover:bg-\[#00612B\]/);
  assert.doesNotMatch(navbar, /bg-\[#009A44\][^\n]*labels\.startFree/);
  assert.match(badge, /success: [^\n]*text-\[#00612B\]/);
  assert.match(globals, /\.auth-form button \{[^\n]*background: #00612b;/);
  assert.match(comparison, /maxWidth: "100%", overflowX: "auto"/);
  assert.match(comparison, /minWidth: 560/);
  assert.match(comparison, /color: "#00612B"/);
  assert.match(comparison, /role="region"/);
  assert.match(comparison, /aria-label="Pricing feature comparison"/);
  assert.match(comparison, /tabIndex=\{0\}/);
  assert.match(cta, /Powered by SoasTech<\/p>/);
  assert.match(cta, /color: brand\.colors\.white/);
  assert.match(marketplace, /if \(listing\.loading && !listing\.data\)/);
  assert.match(browserJourney, /body: \{ overall: 5[^\n]*Premature review denied\./);
});
