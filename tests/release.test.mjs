import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("complete Prisma schema includes all release domains", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  for (const model of ["MarketplaceListing", "Contract", "TimeEntry", "FileNode", "AiRun", "Invoice", "SecurityEvent", "AnalyticsDailyMetric", "BackgroundJob"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
});

test("final migration includes additive RBAC and provider tables", async () => {
  const sql = await readFile(new URL("../prisma/migrations/20260717050000_complete_product_foundation/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE "MarketplaceListing"/);
  assert.match(sql, /CREATE TABLE "WebhookReceipt"/);
  assert.match(sql, /marketplace\.listing\.manage/);
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test("provider secrets are configuration-only", async () => {
  const source = await readFile(new URL("../src/lib/providers/integrations.ts", import.meta.url), "utf8");
  for (const key of ["STORAGE_SIGNING_TOKEN", "AI_PROVIDER_API_KEY", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET"]) assert.match(source, new RegExp(`process\\.env\\.${key}`));
  assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20}/);
});
