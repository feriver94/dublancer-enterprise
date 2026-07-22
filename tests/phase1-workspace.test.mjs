import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard quick actions execute existing APIs", async () => {
  const source = await read("src/components/dashboard/QuickActions.tsx");
  assert.match(source, /useTranslations\("Dashboard"\)/);
  assert.match(source, /\["project", "proposal", "invite", "workspace"\]/);
  assert.match(source, /t\(`action\.\$\{key\}`\)/);
  assert.match(source, /\/api\/projects/);
  assert.match(source, /\/api\/marketplace\/proposals/);
  assert.match(source, /\/api\/organizations\/\$\{organization\.id\}\/invitations/);
  assert.match(source, /router\.push\("\/workspace"\)/);
});

test("workspace pages are protected, route-driven, and use project aggregate APIs", async () => {
  const [index, detail, client, repository] = await Promise.all([
    read("src/app/workspace/page.tsx"),
    read("src/app/workspace/project/[id]/page.tsx"),
    read("src/components/workspace/WorkspaceClient.tsx"),
    read("src/lib/repositories/project.repository.ts"),
  ]);
  assert.match(index, /AuthenticatedShell/);
  assert.match(detail, /params:Promise<\{id:string\}>/);
  assert.match(detail, /projectId=\{id\}/);
  for (const route of ["milestones", "tasks", "comments", "members"]) {
    assert.match(client, new RegExp(`/api/projects/\\$\\{projectId\\}/${route}`));
  }
  assert.match(client, /\/api\/files/);
  for (const relation of ["milestones", "tasks", "comments", "memberships", "attachments", "activities"]) {
    assert.match(repository, new RegExp(`${relation}:`));
  }
});

test("marketplace and contract details load route IDs through live APIs", async () => {
  const [marketplace, proposal, contracts, contractDetail] = await Promise.all([
    read("src/components/marketplace/MarketplaceClient.tsx"),
    read("src/app/marketplace/project/[id]/proposal/page.tsx"),
    read("src/components/contracts/ContractsClient.tsx"),
    read("src/components/contracts/ContractDetailClient.tsx"),
  ]);
  assert.match(marketplace, /\/api\/marketplace\/listings\/\$\{listingId\}/);
  assert.match(marketplace, /\/api\/marketplace\/profile/);
  assert.match(proposal, /proposalForId=\{id\}/);
  assert.match(contracts, /href=\{`\/contracts\/\$\{contract\.id\}`\}/);
  assert.match(contractDetail, /\/api\/contracts\/\$\{contractId\}/);
});

test("navigation and request lifecycle are centralized and permission-aware", async () => {
  const [shell, navbar, client, resource, login] = await Promise.all([
    read("src/components/layout/AuthenticatedShell.tsx"),
    read("src/components/layout/Navbar.tsx"),
    read("src/lib/client/api-client.ts"),
    read("src/lib/client/use-api-resource.ts"),
    read("src/components/auth/LoginForm.tsx"),
  ]);
  assert.match(shell, /getAuthenticatedContext/);
  assert.match(shell, /resolveAuthorization/);
  assert.match(shell, /redirect\(`/);
  assert.match(navbar, /permissions\.includes/);
  assert.match(client, /x-csrf-token/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(resource, /requestId/);
  assert.match(resource, /refresh/);
  assert.match(login, /safeReturnTo/);
});
