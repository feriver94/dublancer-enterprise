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
for (const table of ["WorkGraphNode", "WorkflowDefinition", "WorkflowRun", "WorkflowApproval", "TalentMatch", "RateLimitBucket"]) {
  if (!completeSql.includes(`CREATE TABLE "${table}"`)) throw new Error(`Migration history is missing ${table}.`);
}
for (const table of ["ContractAcceptance", "WorkSubmissionDecision"]) {
  if (!finalSql.includes(`CREATE TABLE "${table}"`)) throw new Error(`Latest commercial migration is missing ${table}.`);
}
if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i.test(finalSql)) throw new Error("Final migration contains a destructive DROP statement.");
console.log(`Migration compatibility checks passed (${entries.length} ordered migrations; additive commercial migration).`);
