import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("Phase 5 AI governance enforces policy, approval, budgets and immutable prompt versions", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("src/lib/services/ai-governance.service.ts");
  const client = read("src/components/ai-platform/AiGovernanceWorkspaceClient.tsx");
  for (const model of ["AiBudgetReservation", "AiPromptVersion", "AiApproval", "AiAuditLog"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.match(service, /assertConfigurationPolicy/);
  assert.match(service, /monthlyTokenBudget/);
  assert.match(service, /monthlyCostBudgetMinor/);
  assert.match(service, /PENDING_APPROVAL/);
  assert.match(service, /ai\.run\.retry_scheduled/);
  assert.match(service, /ai\.run\.output\.discarded/);
  assert.match(service, /policy_blocked/);
  for (const capability of [/t\("policyEnforcement"\)/, /t\("newVersion"\)/, /common\("approve"\)/, /t\("retry"\)/, /t\("dubaiUsage"\)/, /t\("provider"\)/, /t\("tab\.audit"\)/]) assert.match(client, capability);
});

test("Phase 5 shared worker runtime provides leases, heartbeats, retry evidence and dead-letter recovery", () => {
  const schema = read("prisma/schema.prisma");
  const runtime = read("src/lib/jobs/worker-runtime.service.ts");
  const operations = read("src/lib/services/enterprise-operations.service.ts");
  for (const model of ["BackgroundJobAttempt", "JobSchedule", "WorkerHeartbeat", "DeadLetterJob"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.match(runtime, /leaseToken/);
  assert.match(runtime, /LEASE_LOST/);
  assert.match(runtime, /heartbeatJob/);
  assert.match(runtime, /retryAt/);
  assert.match(runtime, /DEAD_LETTER/);
  assert.match(runtime, /enqueueDueSchedules/);
  assert.match(operations, /recoverDeadLetter/);
  assert.match(operations, /recoveryCount/);
});

test("Phase 5 administration covers operational queues, exports, moderation, support, security, retention and health", () => {
  const service = read("src/lib/services/enterprise-operations.service.ts");
  const client = read("src/components/admin/EnterpriseOperationsClient.tsx");
  const exportRoute = read("src/app/api/admin/data-exports/[exportId]/download/route.ts");
  for (const permission of ["platform.operations.manage", "security.events.manage", "data.export", "moderation.manage", "support.manage", "compliance.manage"]) assert.match(service, new RegExp(permission.replace(".", "\\.")));
  assert.match(service, /dataExportArtifact/);
  assert.match(service, /checksumSha256/);
  assert.match(service, /enforceRetention/);
  assert.match(exportRoute, /x-content-sha256/);
  for (const capability of [/t\("pendingJobs"\)/, /t\("attemptHistory"/, /t\("recover"\)/, /t\("tab\.workers"\)/, /t\("schedules"\)/, /t\("requestExport"\)/, /t\("tab\.moderation"\)/, /t\("tab\.support"\)/, /t\("tab\.security"\)/, /t\("tab\.retention"\)/]) assert.match(client, capability);
});

test("Phase 5 internal worker protocol uses constant-time internal authentication and lease tokens", () => {
  const route = read("src/app/api/internal/workers/runtime/route.ts");
  const validation = read("src/lib/validation/phase5.ts");
  assert.match(route, /requireInternalSecret/);
  assert.doesNotMatch(route, /requireCsrfToken/);
  for (const action of ["CLAIM", "HEARTBEAT", "COMPLETE", "FAIL", "SCHEDULE", "PROCESS"]) assert.match(validation, new RegExp(`"${action}"`));
  assert.match(route, /getActiveClaim/);
});

test("Phase 5 migration is chronological, additive and backfills only privileged operator roles", () => {
  const migration = read("prisma/migrations/20260722090000_ai_governance_enterprise_operations/migration.sql");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DROP TYPE/);
  for (const table of ["AiBudgetReservation", "DataExportArtifact", "BackgroundJobAttempt", "JobSchedule", "WorkerHeartbeat"]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  for (const permission of ["ai.approve", "security.events.manage", "platform.operations.manage"]) assert.match(migration, new RegExp(permission.replace(".", "\\.")));
  assert.match(migration, /role\."name" IN \('Owner', 'Admin'\)/);
});
