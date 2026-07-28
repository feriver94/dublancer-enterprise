import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Phase 8 enterprise identity provides federated SSO, strong authentication and governed sessions", () => {
  const schema = read("prisma/schema.prisma");
  const federation = read(
    "src/lib/services/federated-identity.service.ts",
  );
  const mfa = read("src/lib/services/mfa-passkey.service.ts");
  const sessions = read("src/lib/services/session-management.service.ts");
  for (const model of [
    "OrganizationIdentityPolicy",
    "IdentityProvider",
    "ExternalIdentity",
    "IdentityLoginAttempt",
    "MfaFactor",
    "MfaBackupCode",
    "WebAuthnCredential",
    "AuthenticationChallenge",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(federation, /validatePostResponseAsync/);
  assert.match(federation, /createRemoteJWKSet/);
  assert.match(federation, /code_verifier/);
  assert.match(federation, /jitProvisioningEnabled/);
  assert.match(mfa, /verifyTotp/);
  assert.match(mfa, /verifyRegistrationResponse/);
  assert.match(mfa, /verifyAuthenticationResponse/);
  assert.match(mfa, /usedAt: null/);
  assert.match(sessions, /idleExpiresAt/);
  assert.match(sessions, /revokeOtherSessions/);
});

test("Phase 8 SCIM, device trust and privileged access remain tenant scoped and auditable", () => {
  const schema = read("prisma/schema.prisma");
  const scim = read("src/lib/services/scim-provisioning.service.ts");
  const pam = read("src/lib/services/privileged-access.service.ts");
  const auth = read("src/lib/services/auth.service.ts");
  for (const model of [
    "ScimAccessToken",
    "ScimResource",
    "ScimProvisioningEvent",
    "PrivilegedAccessRequest",
    "PrivilegedAccessGrant",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(scim, /organizationId: principal\.organizationId/);
  assert.match(scim, /ensureSeatForMembership/);
  assert.match(scim, /releaseMembershipSeat/);
  assert.match(pam, /request\.requestedById === context\.userId/);
  assert.match(pam, /Privileged access requires independent approval/);
  assert.match(auth, /requireTrustedDevice/);
  assert.match(auth, /createLoginChallenge/);
});

test("Phase 8 observability and scalability expose telemetry, reliability evidence and failover", () => {
  const schema = read("prisma/schema.prisma");
  const reliability = read(
    "src/lib/services/platform-reliability.service.ts",
  );
  const telemetry = read("src/lib/observability/telemetry.ts");
  const metrics = read("src/lib/observability/metrics.ts");
  const cache = read("src/lib/cache/distributed-cache.ts");
  const worker = read("src/lib/jobs/worker-runtime.service.ts");
  const search = read("src/lib/services/search-index.service.ts");
  const oidcRoute = read(
    "src/app/api/auth/sso/oidc/[providerId]/callback/route.ts",
  );
  for (const model of [
    "ServiceLevelObjective",
    "SloMeasurement",
    "AlertHook",
    "AlertDelivery",
    "AuditExportDestination",
    "AuditExportRun",
    "WorkerScalingPolicy",
    "WorkerScalingRecommendation",
    "PerformanceProfile",
    "LoadTestRun",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(telemetry, /NodeSDK/);
  assert.match(telemetry, /OTLPTraceExporter/);
  assert.match(telemetry, /OTLPMetricExporter/);
  assert.match(metrics, /prometheus/);
  assert.match(metrics, /meter\.createCounter/);
  assert.match(metrics, /meter\.createHistogram/);
  assert.match(telemetry, /propagation\.extract/);
  assert.match(oidcRoute, /withRequestSpan/);
  assert.match(reliability, /evaluateObjectives/);
  assert.match(reliability, /runAuditExport/);
  assert.match(reliability, /evaluateScaling/);
  assert.match(reliability, /withPerformanceProfile/);
  assert.match(cache, /circuitOpenUntil/);
  assert.match(cache, /CACHE_FORCE_PRIMARY_FAILURE/);
  assert.match(worker, /dublancer_queue_wait_duration_ms/);
  assert.match(search, /distributedCache/);
});

test("Phase 8 migration and API surface are additive, indexed and security checked", () => {
  const migration = read(
    "prisma/migrations/20260728120000_enterprise_identity_observability_scalability/migration.sql",
  );
  const security = read("scripts/verify-security.mjs");
  const loadTest = read("scripts/load-test.mjs");
  const en = JSON.parse(read("messages/en-AE.json"));
  const ar = JSON.parse(read("messages/ar-AE.json"));
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  assert.match(migration, /CREATE TABLE "IdentityProvider"/);
  assert.match(migration, /CREATE TABLE "ScimProvisioningEvent"/);
  assert.match(migration, /CREATE TABLE "ServiceLevelObjective"/);
  assert.match(migration, /SearchDocument_active_tenant_rank_idx/);
  assert.match(migration, /BackgroundJob_claimable_queue_idx/);
  assert.match(security, /scim\/v2/);
  assert.match(security, /auth\/sso\/saml/);
  assert.match(loadTest, /127\.0\.0\.1|localhost/);
  assert.deepEqual(
    Object.keys(en.IdentityOperations).sort(),
    Object.keys(ar.IdentityOperations).sort(),
  );
  assert.deepEqual(
    Object.keys(en.Reliability).sort(),
    Object.keys(ar.Reliability).sort(),
  );
});
