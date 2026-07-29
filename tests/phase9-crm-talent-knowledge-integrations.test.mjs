import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Phase 9 enterprise CRM is durable, tenant scoped and workflow governed", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/enterprise-crm.service.ts");
  for (const model of [
    "CrmPipeline",
    "CrmPipelineStage",
    "CrmLead",
    "CrmAccount",
    "CrmContact",
    "CrmOpportunity",
    "CrmActivity",
    "CrmNote",
    "CrmQuote",
    "CrmQuoteLine",
    "CrmCustomerHealthSnapshot",
    "CrmCustomerMetric",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(service, /organizationId: context\.organizationId/g);
  assert.match(service, /crm\.lead\.converted/);
  assert.match(service, /Quote cannot move from/);
  assert.match(service, /customerTimeline/);
  assert.match(service, /withPerformanceProfile/);
});

test("Phase 9 talent management covers skills, staffing, capacity, bench and performance", () => {
  const schema = read("prisma/schema.prisma");
  const service = read(
    "src/lib/services/talent-resource-management.service.ts",
  );
  for (const model of [
    "TalentProfile",
    "TalentProfileSkill",
    "TalentCertification",
    "ResourcePlan",
    "StaffingRequirement",
    "StaffingAssignment",
    "TalentAvailability",
    "TalentCapacitySnapshot",
    "TalentBenchEntry",
    "TalentPerformanceRecord",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(service, /exceed 100% capacity/);
  assert.match(service, /talent\.staffing_assigned/);
  assert.match(service, /talentCapacitySnapshot\.upsert/);
  assert.match(service, /talentBenchEntry/);
  assert.match(service, /talentPerformanceRecord\.upsert/);
});

test("Phase 9 knowledge lifecycle integrates approval, search and governed AI retrieval", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/knowledge-management.service.ts");
  for (const model of [
    "KnowledgeCategory",
    "KnowledgeArticle",
    "KnowledgeArticleVersion",
    "KnowledgeApproval",
    "KnowledgeFaq",
    "KnowledgeRetrievalLog",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(service, /independent reviewer/);
  assert.match(service, /knowledge\.approve/);
  assert.match(service, /entityType: "KNOWLEDGE_ARTICLE"/);
  assert.match(read("src/lib/validation/phase4.ts"), /"knowledge_article"/);
  assert.match(service, /AiGovernanceService/);
  assert.match(service, /GOVERNED_AI_PENDING/);
  assert.match(service, /distributedCache\.invalidateTenant/);
});

test("Phase 9 integration framework protects credentials and provides signed retryable delivery", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/enterprise-integration.service.ts");
  const external = read("src/app/api/integrations/rest/events/route.ts");
  for (const model of [
    "IntegrationConnector",
    "IntegrationApiKey",
    "OAuthIntegration",
    "IntegrationWebhookEndpoint",
    "IntegrationEventSubscription",
    "IntegrationEvent",
    "IntegrationWebhookDelivery",
    "IntegrationWebhookDeliveryAttempt",
    "IntegrationRun",
    "IntegrationRunAttempt",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /encryptSecret/);
  assert.match(service, /x-dublancer-signature-256/);
  assert.match(service, /DEAD_LETTER/);
  assert.match(service, /assertOutboundUrl/);
  assert.match(external, /authenticateApiKey/);
  assert.doesNotMatch(service, /secretHash:\s*secret\b/);
});

test("Phase 9 migration, permissions, bilingual UI and security exemptions are additive", () => {
  const migration = read(
    "prisma/migrations/20260729100000_enterprise_crm_talent_knowledge_integrations/migration.sql",
  );
  const permissions = read("src/lib/authorization/permissions.ts");
  const roles = read("src/lib/authorization/default-roles.ts");
  const security = read("scripts/verify-security.mjs");
  const en = JSON.parse(read("messages/en-AE.json"));
  const ar = JSON.parse(read("messages/ar-AE.json"));
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
  assert.match(migration, /CREATE TABLE "CrmAccount"/);
  assert.match(migration, /CREATE TABLE "TalentProfile"/);
  assert.match(migration, /CREATE TABLE "KnowledgeArticle"/);
  assert.match(migration, /CREATE TABLE "IntegrationWebhookDelivery"/);
  for (const permission of [
    "crm.manage",
    "talent.manage",
    "knowledge.approve",
    "integrations.execute",
  ]) {
    assert.match(permissions, new RegExp(permission.replace(".", "\\.")));
    assert.match(roles, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(security, /integrations\/rest\/events/);
  assert.match(security, /authenticateApiKey/);
  for (const namespace of [
    "Phase9CRM",
    "Phase9Talent",
    "Phase9Knowledge",
    "Phase9Integrations",
  ]) {
    assert.deepEqual(
      Object.keys(en[namespace]).sort(),
      Object.keys(ar[namespace]).sort(),
    );
  }
});
