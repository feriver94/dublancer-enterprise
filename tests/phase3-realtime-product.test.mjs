import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const protectedRoutes = [
  "activity", "admin", "admin-control", "agent-marketplace", "agents",
  "ai-copilot", "ai-infrastructure", "ai-platform", "ai-runtime", "analytics",
  "automation", "automations", "backend", "billing", "billing-runtime",
  "communications", "compliance-runtime", "connector-runtime", "contracts", "crm",
  "dashboard", "developers", "enterprise", "event-platform", "executive-ai", "files",
  "identity", "integrations", "knowledge", "knowledge-graph", "knowledge-platform",
  "marketplace", "messaging-runtime", "notifications", "orchestration", "organization",
  "payments", "payments-runtime", "platform", "revenue", "search", "security-center",
  "security-operations", "security-runtime", "talent", "workflow-engine", "workspace",
];

test("FA-004: every product route group is protected by the shared server guard", () => {
  for (const route of protectedRoutes) {
    const source = read(`src/app/${route}/layout.tsx`);
    assert.match(source, /ProductRouteGuard/, `${route} must use ProductRouteGuard`);
  }
  const guard = read("src/components/layout/ProductRouteGuard.tsx");
  assert.match(guard, /getAuthenticatedContext/);
  assert.match(guard, /resolveAuthorization/);
  assert.match(guard, /redirect\(`\/login\?returnTo=/);
  assert.match(guard, /accessDenied/);

  const navbar = read("src/components/layout/Navbar.tsx");
  assert.match(navbar, /resolveAuthorization/);
  assert.match(navbar, /permission: "chat\.read"/);
  assert.match(navbar, /key: "chat"/);
  assert.match(navbar, /key: "notifications"/);
  assert.match(navbar, /\{t\(item\.key\)\}/);
});

test("FA-009: chat product UI connects every required collaboration lifecycle", () => {
  const page = read("src/app/communications/chat/page.tsx");
  const client = read("src/components/chat/ChatWorkspaceClient.tsx");
  assert.doesNotMatch(page, /EnterpriseModulePage/);
  assert.match(page, /ChatWorkspaceClient/);
  for (const capability of [
    /api\/chat\/channels/,
    /messages\?take=/,
    /reactions/,
    /\/read/,
    /\/typing/,
    /realtime\/presence/,
    /realtime\/stream/,
    /beforeSequence/,
    /EventSource/,
    /reconnecting/i,
  ]) assert.match(client, capability);
});

test("FA-010: Redis failures are bounded and use durable fallbacks", () => {
  const redis = read("src/lib/realtime/redis.ts");
  const limiter = read("src/lib/chat/rate-limit.ts");
  const sse = read("src/lib/realtime/sse.ts");
  const messages = read("src/lib/services/chat-message.service.ts");
  assert.match(redis, /commandTimeout: 1_200/);
  assert.match(redis, /runRedisOperation/);
  assert.match(limiter, /enforceRateLimit/);
  assert.match(limiter, /backend: "database"/);
  assert.match(sse, /SERVICE_UNAVAILABLE/);
  assert.match(sse, /503/);
  assert.match(messages, /realtimeAvailable: false/);
  assert.match(messages, /retryable: true/);
});

test("FA-019: notification inbox is tenant scoped and implements the full lifecycle", () => {
  const page = read("src/app/notifications/page.tsx");
  const client = read("src/components/notifications/NotificationInboxClient.tsx");
  const service = read("src/lib/notifications/notification.service.ts");
  const preferences = read("src/lib/notifications/preferences.service.ts");
  assert.doesNotMatch(page, /EnterpriseModulePage/);
  assert.match(page, /NotificationInboxClient/);
  for (const capability of [
    /UNREAD/,
    /ARCHIVED/,
    /read-all/,
    /notification-preferences/,
    /nextCursor/,
    /EventSource/,
    /actionUrl/,
  ]) assert.match(client, capability);
  assert.match(service, /organizationId: context\.organizationId/);
  assert.match(service, /REALTIME_EVENTS\.NOTIFICATION_UPDATED/);
  assert.match(preferences, /organizationId: context\.organizationId/);
  assert.match(preferences, /REALTIME_EVENTS\.NOTIFICATION_PREFERENCES_UPDATED/);
});
