import { readFile, readdir } from "node:fs/promises";

const migrationsRoot = new URL("../prisma/migrations/", import.meta.url);
const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (entries.length < 10) throw new Error(`Expected at least 10 migrations; found ${entries.length}.`);
if (new Set(entries).size !== entries.length) throw new Error("Duplicate migration directory detected.");
for (const name of entries) {
  if (!/^\d{14}_[a-z0-9_]+$/.test(name)) throw new Error(`Invalid chronological migration name: ${name}`);
  const sql = await readFile(new URL(`${name}/migration.sql`, migrationsRoot), "utf8");
  if (!sql.trim()) throw new Error(`Empty migration: ${name}`);
}

const migrationSql = await Promise.all(entries.map((name) => readFile(new URL(`${name}/migration.sql`, migrationsRoot), "utf8")));
const completeSql = migrationSql.join("\n");
const finalSql = migrationSql.at(-1);
const commercialMigrationName = "20260719090000_governed_commercial_settlement";
const phase4MigrationName = "20260720090000_enterprise_files_search_analytics";
const phase5MigrationName = "20260722090000_ai_governance_enterprise_operations";
const phase6MigrationName = "20260722180000_contract_workspace_localization";
const phase7MigrationName = "20260723090000_subscriptions_members_email_security";
const phase8MigrationName = "20260728120000_enterprise_identity_observability_scalability";
const phase9MigrationName = "20260729100000_enterprise_crm_talent_knowledge_integrations";
const phase10MigrationName = "20260730150000_enterprise_production_performance";
const phaseAMigrationName = "20260801090000_dual_profile_marketplace_phase_a";
const phaseBMigrationName = "20260801150000_dual_profile_marketplace_phase_b";
const commercialSql = migrationSql[entries.indexOf(commercialMigrationName)];
const phase4Sql = migrationSql[entries.indexOf(phase4MigrationName)];
const phase5Sql = migrationSql[entries.indexOf(phase5MigrationName)];
const phase6Sql = migrationSql[entries.indexOf(phase6MigrationName)];
const phase7Sql = migrationSql[entries.indexOf(phase7MigrationName)];
const phase8Sql = migrationSql[entries.indexOf(phase8MigrationName)];
const phase9Sql = migrationSql[entries.indexOf(phase9MigrationName)];
const phase10Sql = migrationSql[entries.indexOf(phase10MigrationName)];
const phaseASql = migrationSql[entries.indexOf(phaseAMigrationName)];
const phaseBSql = migrationSql[entries.indexOf(phaseBMigrationName)];
for (const table of ["WorkGraphNode", "WorkflowDefinition", "WorkflowRun", "WorkflowApproval", "TalentMatch", "RateLimitBucket"]) {
  if (!completeSql.includes(`CREATE TABLE "${table}"`)) throw new Error(`Migration history is missing ${table}.`);
}
for (const table of ["ContractAcceptance", "WorkSubmissionDecision"]) {
  if (!commercialSql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Commercial migration is missing ${table}.`);
}
for (const table of ["FileUploadIntent", "SearchIndexCheckpoint", "AnalyticsAggregationRun"]) {
  if (!phase4Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 4 migration is missing ${table}.`);
}
for (const table of ["AiBudgetReservation", "BackgroundJobAttempt", "JobSchedule", "WorkerHeartbeat", "DataExportArtifact"]) {
  if (!phase5Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 5 migration is missing ${table}.`);
}
for (const table of ["DisputeEvent"]) {
  if (!phase6Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 6 migration is missing ${table}.`);
}
for (const table of ["PlanFeatureEntitlement", "SubscriptionSeat", "Department", "Team", "AccessReview", "EmailMessage", "EmailBounce", "VerifiedDevice", "AdaptiveRiskDecision", "AccountLock"]) {
  if (!phase7Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 7 migration is missing ${table}.`);
}
for (const table of ["IdentityProvider", "ExternalIdentity", "MfaFactor", "WebAuthnCredential", "ScimAccessToken", "ScimResource", "PrivilegedAccessGrant", "ServiceLevelObjective", "AlertHook", "AuditExportRun", "WorkerScalingPolicy", "PerformanceProfile", "LoadTestRun"]) {
  if (!phase8Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 8 migration is missing ${table}.`);
}
for (const table of ["CrmPipeline", "CrmLead", "CrmOpportunity", "CrmQuote", "TalentProfile", "StaffingAssignment", "TalentCapacitySnapshot", "KnowledgeArticle", "KnowledgeArticleVersion", "KnowledgeRetrievalLog", "IntegrationConnector", "IntegrationApiKey", "IntegrationWebhookDelivery", "IntegrationRun"]) {
  if (!phase9Sql?.includes(`CREATE TABLE "${table}"`)) throw new Error(`Phase 9 migration is missing ${table}.`);
}
for (const index of ["SearchQueryLog_organizationId_durationMs_createdAt_idx", "PerformanceProfile_organizationId_status_startedAt_idx", "BackgroundJob_organizationId_queue_status_priority_availableAt_idx", "IntegrationRun_organizationId_status_availableAt_idx"]) {
  if (!phase10Sql?.includes(`CREATE INDEX \"${index}\"`)) throw new Error(`Phase 10 migration is missing ${index}.`);
}
for (const table of ["PersonalIdentity", "OnboardingProgress", "AccountPersona", "ClientProfile", "PersonaEvent"]) {
  if (!phaseASql?.includes(`CREATE TABLE \"${table}\"`)) throw new Error(`Phase A migration is missing ${table}.`);
}
for (const index of ["AccountPersona_one_client_per_account_key", "AccountPersona_one_freelancer_per_account_key", "AuthSession_activePersonaId_status_idx"]) {
  if (!phaseASql?.includes(`CREATE UNIQUE INDEX \"${index}\"`) && !phaseASql?.includes(`CREATE INDEX \"${index}\"`)) throw new Error(`Phase A migration is missing ${index}.`);
}
for (const table of ["Education", "Certification", "ProfileSocialLink", "SavedProvider"]) {
  if (!phaseBSql?.includes(`CREATE TABLE \"${table}\"`)) throw new Error(`Phase B migration is missing ${table}.`);
}
for (const index of ["User_username_key", "PortfolioItem_freelancerProfileId_contentType_visibility_sortOrder_idx", "Education_freelancerProfileId_visibility_endedAt_idx", "Certification_freelancerProfileId_visibility_issuedAt_idx"]) {
  if (!phaseBSql?.includes(`CREATE UNIQUE INDEX \"${index}\"`) && !phaseBSql?.includes(`CREATE INDEX \"${index}\"`)) throw new Error(`Phase B migration is missing ${index}.`);
}
if (entries.at(-1) !== phaseBMigrationName) throw new Error("Phase B migration must be the latest chronological migration.");
if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i.test(finalSql)) throw new Error("Final migration contains a destructive DROP statement.");
console.log(`Migration compatibility checks passed (${entries.length} ordered migrations; additive commercial, Phase 4-10 and Dual-Profile Phase A-B migrations).`);
