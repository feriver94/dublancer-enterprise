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
const commercialSql = migrationSql[entries.indexOf(commercialMigrationName)];
const phase4Sql = migrationSql[entries.indexOf(phase4MigrationName)];
const phase5Sql = migrationSql[entries.indexOf(phase5MigrationName)];
const phase6Sql = migrationSql[entries.indexOf(phase6MigrationName)];
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
if (entries.at(-1) !== phase6MigrationName) throw new Error("Phase 6 migration must be the latest chronological migration.");
if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i.test(finalSql)) throw new Error("Final migration contains a destructive DROP statement.");
console.log(`Migration compatibility checks passed (${entries.length} ordered migrations; additive commercial and Phase 4-6 migrations).`);
