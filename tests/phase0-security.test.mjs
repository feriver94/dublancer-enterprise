import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 0 tenant, CSRF, project RBAC and refresh protections remain intact", async () => {
  const [
    organizations,
    refresh,
    invitation,
    bootstrap,
    projectService,
    session,
    authService,
  ] = await Promise.all([
    read("src/app/api/organizations/route.ts"),
    read("src/app/api/auth/refresh/route.ts"),
    read("src/app/api/organization-invitations/accept/route.ts"),
    read("src/app/api/organizations/[organizationId]/authorization/bootstrap/route.ts"),
    read("src/lib/services/project.service.ts"),
    read("src/lib/auth/session.ts"),
    read("src/lib/services/auth.service.ts"),
  ]);

  assert.doesNotMatch(organizations, /x-organization-id/);
  assert.match(organizations, /getAuthenticatedContext/);
  assert.match(refresh, /requireCsrfToken/);
  assert.match(refresh, /requireSameOrigin/);
  assert.match(invitation, /requireCsrfToken/);
  assert.match(bootstrap, /requireCsrfToken/);
  assert.match(projectService, /requirePermission/);
  assert.match(projectService, /requireProjectAccess/);
  assert.match(session, /claims\.organizationId !== session\.organizationId/);
  assert.match(session, /status: "ACTIVE"/);
  assert.match(authService, /Refresh token replay was detected/);
  assert.match(authService, /rotatedFromSessionId/);
});

test("Phase 0 internal endpoints use shared constant-time authentication", async () => {
  const helper = await read("src/lib/security/internal-auth.ts");
  const routes = await Promise.all([
    read("src/app/api/realtime/publish/route.ts"),
    read("src/app/api/internal/notifications/create/route.ts"),
    read("src/app/api/internal/notifications/process/route.ts"),
    read("src/app/api/internal/notifications/route.ts"),
    read("src/app/api/internal/chat/retention/route.ts"),
    read("src/app/api/internal/workers/ai/route.ts"),
  ]);

  assert.match(helper, /timingSafeEqual/);
  assert.match(helper, /requireInternalHeader/);
  for (const route of routes) {
    assert.match(route, /requireInternalHeader/);
  }
});
