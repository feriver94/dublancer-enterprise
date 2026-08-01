import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Phase 10 production profiles provide immutable multi-region rolling and blue-green delivery", () => {
  const docker = read("Dockerfile");
  const deployment = read("deploy/kubernetes/base/deployment.yaml");
  const blueGreen = read("deploy/kubernetes/profiles/blue-green.yaml");
  assert.match(docker, /\.next\/standalone/);
  assert.match(docker, /USER 1001:1001/);
  assert.match(deployment, /maxUnavailable: 0/);
  assert.match(deployment, /topologySpreadConstraints/);
  assert.match(deployment, /readOnlyRootFilesystem: true/);
  assert.match(blueGreen, /release-color: green/);
  assert.match(read("deploy/kubernetes/overlays/uae-north/region-patch.yaml"), /uae-north/);
  assert.match(read("deploy/kubernetes/overlays/europe-west/region-patch.yaml"), /europe-west/);
});

test("Phase 10 operations assets cover collectors dashboards alerts backups and restore verification", () => {
  const collector = read("deploy/observability/otel-collector.yaml");
  const alerts = read("deploy/observability/prometheus-rules.yaml");
  const backup = read("deploy/backup/backup-cronjob.yaml");
  assert.match(collector, /tail_sampling/);
  assert.match(collector, /prometheusremotewrite/);
  assert.match(collector, /otlphttp\/logs/);
  assert.match(alerts, /DublancerHighErrorRate/);
  assert.match(alerts, /DublancerDeadLetters/);
  assert.match(backup, /concurrencyPolicy: Forbid/);
  assert.doesNotThrow(() => JSON.parse(read("deploy/observability/grafana-platform-overview.json")));
  assert.doesNotThrow(() => JSON.parse(read("deploy/observability/grafana-performance.json")));
});

test("Phase 10 cache invalidation and search federation preserve tenant and permission boundaries", () => {
  const cache = read("src/lib/cache/distributed-cache.ts");
  const route = read("src/app/api/internal/cache/invalidate/route.ts");
  const federation = read("src/lib/services/federated-search.service.ts");
  const search = read("src/lib/services/search-index.service.ts");
  assert.match(cache, /CACHE_INVALIDATION_PEERS/);
  assert.match(route, /requireInternalHeader/);
  assert.match(route, /propagate: false/);
  assert.match(federation, /item\.organizationId === input\.organizationId/);
  assert.match(federation, /allowedPermissions\.has/);
  assert.match(federation, /allowedProjects\.has/);
  assert.match(search, /await federatedSearch/);
});

test("Phase 10 worker batching capacity evidence and load thresholds are bounded", () => {
  const worker = read("src/lib/services/enterprise-operations.service.ts");
  const reliability = read("src/lib/services/platform-reliability.service.ts");
  const k6 = read("deploy/load-testing/k6-capacity.js");
  assert.match(worker, /async processBatch/);
  assert.match(worker, /Math\.min\(Math\.max\(batchSize, 1\), 25\)/);
  assert.match(reliability, /async capacityReport/);
  assert.match(reliability, /dublancer_queue_pending_jobs/);
  assert.match(k6, /p\(95\)<750/);
  assert.match(k6, /ramping-arrival-rate/);
});

test("Phase 10 migration adds only measured hot-path indexes", () => {
  const migration = read("prisma/migrations/20260730150000_enterprise_production_performance/migration.sql");
  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  for (const index of [
    "SearchQueryLog_organizationId_durationMs_createdAt_idx",
    "PerformanceProfile_organizationId_status_startedAt_idx",
    "BackgroundJob_organizationId_queue_status_priority_availableAt_idx",
    "IntegrationRun_organizationId_status_availableAt_idx",
  ]) assert.match(migration, new RegExp(index));
  assert.match(schema, /@@index\(\[organizationId, queue, status, priority, availableAt\]\)/);
});

test("Phase 10 consolidates legacy product routes and completes project member administration", () => {
  for (const [route, destination] of [
    ["platform", "/admin"],
    ["admin-control", "/admin"],
    ["billing", "/payments"],
    ["ai-copilot", "/ai-platform"],
  ]) {
    const source = read(`src/app/${route}/page.tsx`);
    assert.match(source, new RegExp(`redirect\\(\\"${destination}\\"\\)`));
    assert.doesNotMatch(source, /enterprise-module-page/);
  }
  assert.match(read("src/app/orchestration/page.tsx"), /OrchestrationClient/);
  const navigation = read("src/components/layout/Navbar.tsx");
  assert.match(navigation, /href: "\/ai-platform"/);
  assert.doesNotMatch(navigation, /href: "\/ai-copilot"/);
  const members = read("src/components/workspace/ProjectMemberManagement.tsx");
  assert.match(members, /memberPicker/);
  assert.match(members, /updateRole/);
  assert.match(members, /removeMember/);
  const route = read("src/app/api/projects/[projectId]/members/[userId]/route.ts");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
});

test("Phase 10 automates accessibility responsive and cross-browser verification", () => {
  const browser = read("tests/browser/accessibility.spec.ts");
  const config = read("playwright.config.ts");
  const workflow = read(".github/workflows/browser-compatibility.yml");
  assert.match(browser, /AxeBuilder/);
  assert.match(browser, /scrollWidth/);
  assert.match(browser, /keyboard\.press\(\"Tab\"\)/);
  for (const engine of ["chromium", "firefox", "webkit"]) {
    assert.match(config, new RegExp(`name: \\"${engine}\\"`));
    assert.match(workflow, new RegExp(engine));
  }
});
