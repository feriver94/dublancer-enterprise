import assert from "node:assert/strict";

const baseUrl = process.env.HEALTH_BASE_URL?.trim() ?? "http://127.0.0.1:3000";
const expectedDatabaseHttp = Number(process.env.EXPECT_DATABASE_HTTP ?? 200);
const expectedReadinessHttp = Number(process.env.EXPECT_READINESS_HTTP ?? 200);
const expectedDatabaseStatus = process.env.EXPECT_DATABASE_STATUS ?? "healthy";
const expectedReadinessStatus = process.env.EXPECT_READINESS_STATUS ?? "ready";

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  const body = JSON.parse(text);
  return { response, text, body };
}

function assertSanitized(text) {
  const normalized = text.toLowerCase();
  for (const forbidden of [
    "postgresql://",
    "redis://",
    "database_url",
    "redis_url",
    "connection string",
    "prismaclient",
    "stack trace",
    " at /",
  ]) {
    assert.ok(!normalized.includes(forbidden), `Health response leaked forbidden diagnostic text: ${forbidden}`);
  }
  for (const variable of ["DATABASE_URL", "REDIS_URL"]) {
    const value = process.env[variable];
    if (value) assert.ok(!text.includes(value), `Health response leaked ${variable}.`);
  }
}

const database = await request("/api/health/database");
const readiness = await request("/api/health/ready");
assert.equal(database.response.status, expectedDatabaseHttp);
assert.equal(database.body?.status, expectedDatabaseStatus);
assert.equal(readiness.response.status, expectedReadinessHttp);
assert.equal(readiness.body?.status, expectedReadinessStatus);
assert.equal(database.response.headers.get("cache-control"), "no-store");
assert.equal(readiness.response.headers.get("cache-control"), "no-store");
assertSanitized(database.text);
assertSanitized(readiness.text);

console.log(JSON.stringify({
  result: "PASS",
  database: { http: database.response.status, status: database.body.status },
  readiness: { http: readiness.response.status, status: readiness.body.status },
  sanitized: true,
}, null, 2));
