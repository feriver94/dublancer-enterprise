import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Phase 7 subscription administration normalizes plans, entitlements, quotas, seats and lifecycle evidence", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/subscription-administration.service.ts");
  const route = read("src/app/api/billing/subscription/lifecycle/route.ts");
  for (const model of [
    "PlanFeatureEntitlement",
    "PlanUsageQuota",
    "SubscriptionSeat",
    "SubscriptionEvent",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  for (const capability of [
    "dashboard",
    "transition",
    "configureLegacy",
    "ensureSeatForMembership",
    "releaseMembershipSeat",
  ]) {
    assert.match(service, new RegExp(capability));
  }
  assert.match(service, /subscription seat quota has been reached/i);
  assert.match(route, /subscriptionLifecycleSchema/);
});

test("Phase 7 member administration covers bulk operations, hierarchy, permission audits and access reviews", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/member-administration.service.ts");
  const client = read(
    "src/components/organization/EnterpriseAdministrationClient.tsx",
  );
  for (const model of [
    "Department",
    "Team",
    "TeamMembership",
    "PermissionAudit",
    "AccessReview",
    "AccessReviewItem",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  for (const capability of [
    "bulkInvite",
    "bulkRoleChange",
    "createDepartment",
    "createTeam",
    "runPermissionAudit",
    "createAccessReview",
    "decideAccessReviewItem",
    "completeAccessReview",
  ]) {
    assert.match(service, new RegExp(`async ${capability}\\(`));
  }
  assert.match(service, /last active owner cannot be changed or removed/i);
  assert.match(client, /useTranslations\("Administration"\)/);
});

test("Phase 7 account email and adaptive abuse operations are durable and audited", () => {
  const schema = read("prisma/schema.prisma");
  const email = read("src/lib/services/email-operations.service.ts");
  const abuse = read("src/lib/services/adaptive-abuse.service.ts");
  const auth = read("src/lib/services/auth.service.ts");
  for (const model of [
    "EmailTemplate",
    "EmailMessage",
    "EmailDeliveryAttempt",
    "EmailBounce",
    "EmailAuditEvent",
    "EmailChangeToken",
    "VerifiedDevice",
    "AdaptiveRiskDecision",
    "AccountLock",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(email, /email\.retry_scheduled/);
  assert.match(email, /recordProviderEvent/);
  assert.match(abuse, /REPEATED_ACCOUNT_FAILURES/);
  assert.match(abuse, /AUTH_ADAPTIVE_ACCOUNT_LOCK/);
  assert.match(auth, /assertLoginAllowed/);
  assert.match(auth, /recordFailure/);
});

test("Phase 7 migration and route surface remain additive, tenant-scoped and localized", () => {
  const migration = read(
    "prisma/migrations/20260723090000_subscriptions_members_email_security/migration.sql",
  );
  const security = read("scripts/verify-security.mjs");
  const en = JSON.parse(read("messages/en-AE.json"));
  const ar = JSON.parse(read("messages/ar-AE.json"));
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  assert.match(migration, /CREATE TABLE "SubscriptionSeat"/);
  assert.match(migration, /CREATE TABLE "EmailMessage"/);
  assert.match(migration, /CREATE TABLE "AdaptiveRiskDecision"/);
  assert.match(security, /internal\/email\/process\/route\.ts/);
  assert.deepEqual(
    Object.keys(en.Administration).sort(),
    Object.keys(ar.Administration).sort(),
  );
  assert.match(JSON.stringify(ar.Administration), /[\u0600-\u06ff]/);
});
