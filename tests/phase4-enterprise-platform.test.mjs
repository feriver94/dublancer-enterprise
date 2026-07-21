import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("FA-011 and FA-022: governed files require signed intent completion and clean scan evidence", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/enterprise-file.service.ts");
  const provider = read("src/lib/providers/integrations.ts");
  const attachmentRoute = read("src/app/api/projects/[projectId]/attachments/route.ts");
  const client = read("src/components/files/FileBrowserClient.tsx");
  for (const model of ["FileUploadIntent", "FileVersion", "FileLock", "FileActivity"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.match(schema, /fileVersionId\s+String\s+@unique/);
  assert.match(provider, /verifyUpload/);
  assert.match(provider, /submit\(input: Parameters<FileScanProvider/);
  assert.match(service, /INTEGRITY_MISMATCH/);
  assert.match(service, /scanStatus !== "CLEAN"/);
  assert.match(service, /retention period ends/);
  assert.match(service, /legal hold/);
  assert.match(service, /folder cannot be moved into its descendant/i);
  assert.match(attachmentRoute, /bindProjectAttachment/);
  assert.doesNotMatch(attachmentRoute, /storageKey/);
  for (const capability of [/upload-intents/, /versions\/upload-intents/, /uploadProgress/, /malware scan/i, /Legal hold/, /Restore/, /EventSource/]) assert.match(client, capability);
});

test("FA-013: search has durable producers, leased workers, FTS ranking and permission filtering", () => {
  const migration = read("prisma/migrations/20260720090000_enterprise_files_search_analytics/migration.sql");
  const service = read("src/lib/services/search-index.service.ts");
  const route = read("src/app/api/internal/workers/search/route.ts");
  const client = read("src/components/search/SearchProductClient.tsx");
  assert.match(migration, /searchVector.*tsvector/s);
  assert.match(migration, /USING GIN/);
  assert.match(service, /SEARCH_REINDEX/);
  assert.match(service, /SEARCH_INCREMENTAL/);
  assert.match(service, /SEARCH_ENTITY/);
  assert.match(service, /requiredPermission/);
  assert.match(service, /ts_rank_cd/);
  assert.match(service, /ts_headline/);
  assert.match(service, /nextCursor/);
  assert.match(route, /requireInternalSecret/);
  assert.match(client, /Reindex organization/);
  assert.match(client, /Load more ranked results/);
});

test("FA-014: analytics is scheduled, idempotent, backfillable and freshness-aware", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/analytics-aggregation.service.ts");
  const route = read("src/app/api/internal/workers/analytics/route.ts");
  const client = read("src/components/analytics/AnalyticsDashboardClient.tsx");
  assert.match(schema, /model AnalyticsAggregationRun \{/);
  assert.match(schema, /@@unique\(\[organizationId, idempotencyKey\]\)/);
  assert.match(service, /analyticsDayBounds/);
  assert.match(service, /Asia\/Dubai/);
  assert.match(service, /scheduleDaily/);
  assert.match(service, /analyticsDailyMetric\.deleteMany/);
  assert.match(service, /analyticsDailyMetric\.create/);
  assert.match(route, /requireInternalSecret/);
  for (const capability of [/freshness/, /Daily trend/, /drill-down/i, /backfill/i, /EventSource/]) assert.match(client, capability);
});

test("Phase 4 migration is additive and hardens legacy attachment and root-name upgrade paths", () => {
  const migration = read("prisma/migrations/20260720090000_enterprise_files_search_analytics/migration.sql");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(migration, /legacy-unverified/);
  assert.match(migration, /NOT_CONFIGURED/);
  assert.match(migration, /duplicate_roots/);
  assert.match(migration, /FileNode_organization_root_name_key/);
  assert.match(migration, /BackgroundJob_deduplicationKey_key/);
});

test("Phase 4 internal worker routes use the existing constant-time internal auth boundary", () => {
  for (const domain of ["files", "search", "analytics"]) {
    const source = read(`src/app/api/internal/workers/${domain}/route.ts`);
    assert.match(source, /requireInternalSecret/);
    assert.doesNotMatch(source, /requireCsrfToken/);
  }
});
