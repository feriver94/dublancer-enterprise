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

const finalSql = await readFile(new URL(`${entries.at(-1)}/migration.sql`, migrationsRoot), "utf8");
for (const table of ["WorkGraphNode", "WorkflowDefinition", "WorkflowRun", "WorkflowApproval", "TalentMatch", "RateLimitBucket"]) {
  if (!finalSql.includes(`CREATE TABLE "${table}"`)) throw new Error(`Final migration is missing ${table}.`);
}
if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i.test(finalSql)) throw new Error("Final migration contains a destructive DROP statement.");
console.log(`Migration compatibility checks passed (${entries.length} ordered migrations; additive final migration).`);
