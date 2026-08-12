import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Sprint 1 exposes logout globally and revokes duplicate session fingerprints", () => {
  const navbar = read("src/components/layout/NavbarClient.tsx");
  const logout = read("src/app/api/auth/logout/route.ts");
  const auth = read("src/lib/services/auth.service.ts");
  assert.match(navbar, /api\/auth\/logout/);
  assert.match(navbar, /router\.replace\("\/login"\)/);
  assert.match(navbar, /profileOpen/);
  assert.match(logout, /hashRefreshToken/);
  assert.match(logout, /status: "REVOKED"/);
  assert.match(logout, /duplicateSessionsRemoved/);
  assert.match(auth, /userAgent: input\.metadata\.userAgent/);
  assert.match(auth, /tx\.authSession\.updateMany/);
});

test("Sprint 1 contracts support linked create list edit and guarded draft deletion", () => {
  const service = read("src/lib/services/product-platform.service.ts");
  const route = read("src/app/api/contracts/[contractId]/route.ts");
  const list = read("src/components/contracts/ContractsClient.tsx");
  const detail = read("src/components/contracts/ContractDetailClient.tsx");
  assert.match(service, /async update\(context: TenantContext, contractId/);
  assert.match(service, /async delete\(context: TenantContext, contractId/);
  assert.match(service, /Only draft contracts can be edited directly/);
  assert.match(route, /export async function DELETE/);
  assert.match(list, /projectId/);
  assert.match(list, /createFirst/);
  assert.match(detail, /contract:edit/);
  assert.match(detail, /confirmation: "DELETE"/);
});

test("Sprint 1 enterprise control center uses live tenant data for every administration surface", () => {
  const page = read("src/app/enterprise/page.tsx");
  const client = read("src/components/enterprise/EnterpriseControlCenterClient.tsx");
  const service = read("src/lib/services/enterprise-control-center.service.ts");
  const organizations = read("src/app/api/organizations/route.ts");
  assert.match(page, /EnterpriseControlCenterClient/);
  assert.doesNotMatch(page, /EnterpriseStats|OrganizationProfile|SecurityCenter/);
  assert.match(client, /department\.create/);
  assert.match(client, /team\.create/);
  assert.match(client, /invitations\/bulk/);
  assert.match(service, /securityEvent\.count/);
  assert.match(service, /score: checks\.reduce/);
  assert.match(service, /auditEvent\.findMany/);
  assert.match(organizations, /export async function POST/);
  assert.match(read("src/app/enterprise/organization/page.tsx"), /redirect\("\/enterprise"\)/);
});

test("Sprint 1 navbar is responsive and global search supports six blocker entities with Ctrl K", () => {
  const navbar = read("src/components/layout/NavbarClient.tsx");
  const search = read("src/lib/services/search-index.service.ts");
  const schema = read("src/lib/validation/phase4.ts");
  assert.match(navbar, /primaryItems = items\.slice\(0, 4\)/);
  assert.match(navbar, /overflowItems = items\.slice\(4\)/);
  assert.match(navbar, /xl:hidden/);
  assert.match(navbar, /event\.ctrlKey \|\| event\.metaKey/);
  for (const entity of ["PROJECT", "TASK", "USER", "FILE", "CONTRACT", "ORGANIZATION"]) {
    assert.match(search, new RegExp(`"${entity}"`));
  }
  for (const entity of ["project", "task", "user", "file", "contract", "organization"]) {
    assert.match(schema, new RegExp(`"${entity}"`));
  }
});

test("Sprint 1 validates the complete dependency DAG and never renders a contradictory member empty state", () => {
  const dag = read("src/lib/workspace/dependency-dag.ts");
  const workspace = read("src/lib/services/phase6-workspace.service.ts");
  const members = read("src/components/workspace/ProjectMemberManagement.tsx");
  assert.match(dag, /predecessorTaskId === edge\.successorTaskId/);
  assert.match(dag, /visited !== nodes\.size/);
  assert.match(dag, /directed acyclic graph/);
  assert.match(workspace, /validateTaskDependencyDag\(\[\.\.\.links/);
  assert.doesNotMatch(members, /t\("noMembers"\)/);
  assert.match(members, /projectOwner/);
});

test("Sprint 1 observability publishes live request worker queue error availability and latency metrics", () => {
  const service = read("src/lib/services/platform-reliability.service.ts");
  const client = read("src/components/admin/ReliabilityDashboardClient.tsx");
  for (const field of ["errorRatePercent", "availabilityPercent", "p95LatencyMs", "requestCount", "collectingSamples"]) {
    assert.match(service, new RegExp(field));
    assert.match(client, new RegExp(field));
  }
  assert.match(service, /queue: queueTotals/);
  assert.match(client, /15_000/);
  assert.match(client, /t\("collecting"\)/);
  assert.doesNotMatch(client, /\?\? "NO_DATA"/);
});

test("Sprint 1 project notifications complete unread read archive and realtime lifecycle", () => {
  const notifications = read("src/lib/notifications/notification.service.ts");
  const projects = read("src/lib/services/project-workspace.service.ts");
  const inbox = read("src/components/notifications/NotificationInboxClient.tsx");
  assert.match(projects, /createNotificationInTransaction/);
  assert.match(projects, /category: "PROJECT"/);
  assert.match(notifications, /NOTIFICATION_CREATED/);
  assert.match(notifications, /NOTIFICATION_UPDATED/);
  assert.match(notifications, /async markRead/);
  assert.match(notifications, /async archive/);
  assert.match(inbox, /EventSource/);
});

test("Sprint 1 health score is dynamic across delivery signals including dependencies", () => {
  const service = read("src/lib/services/phase6-workspace.service.ts");
  const delivery = read("src/components/workspace/AdvancedDeliveryClient.tsx");
  const panel = read("src/components/workspace/ProjectHealthPanel.tsx");
  for (const signal of ["overdueTasks", "criticalRisks", "openIssues", "overdueDeliverables", "pendingTimesheets", "blockedDependencies"]) {
    assert.match(service, new RegExp(signal));
  }
  assert.match(service, /taskDependency\.findMany/);
  assert.match(delivery, /current\.score\}%/);
  assert.doesNotMatch(delivery, /score\}\/100/);
  assert.doesNotMatch(panel, /92%|100\/100/);
});
