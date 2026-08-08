import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReadiness,
  unavailableReadiness,
} from "../src/lib/reliability/readiness.ts";

const now = () => new Date("2026-08-08T12:00:00.000Z");
const healthyDatabase = () => Promise.resolve({
  status: "healthy",
  latencyMs: 4,
  checkedAt: now().toISOString(),
});
const healthyQueue = () => Promise.resolve({ pendingJobs: 2, deadLetters: 0 });
const cacheHealth = () => ({ strategy: "redis-primary-local-lru-fallback" });

function probes(overrides = {}) {
  return {
    checkDatabase: healthyDatabase,
    checkRedis: () => Promise.resolve(true),
    inspectQueue: healthyQueue,
    cacheHealth,
    now,
    ...overrides,
  };
}

test("readiness is ready only when database, Redis and queue checks are healthy", async () => {
  const result = await evaluateReadiness(probes());
  assert.equal(result.status, "ready");
  assert.equal(result.checks.database.status, "healthy");
  assert.equal(result.checks.redis.status, "healthy");
  assert.equal(result.checks.queue.status, "healthy");
});

test("database outage degrades safely without inspecting its queue", async () => {
  let queueInspected = false;
  const result = await evaluateReadiness(probes({
    checkDatabase: () => Promise.resolve({ status: "unhealthy", latencyMs: 9, checkedAt: now().toISOString() }),
    inspectQueue: async () => { queueInspected = true; throw new Error("must not run"); },
  }));
  assert.equal(result.status, "unhealthy");
  assert.equal(queueInspected, false);
  assert.deepEqual(result.checks.queue, {
    status: "unhealthy",
    pendingJobs: null,
    deadLetters: null,
    reason: "DATABASE_UNAVAILABLE",
  });
});

test("Redis outage makes readiness unhealthy", async () => {
  const result = await evaluateReadiness(probes({ checkRedis: () => Promise.resolve(false) }));
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.redis.status, "unhealthy");
});

test("database and Redis outage remain a structured unhealthy result", async () => {
  const result = await evaluateReadiness(probes({
    checkDatabase: () => Promise.reject(new Error("postgresql://operator:secret@private-host/database")),
    checkRedis: () => Promise.reject(new Error("redis://:secret@private-host")),
  }));
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.database.status, "unhealthy");
  assert.equal(result.checks.redis.status, "unhealthy");
  assert.equal(result.checks.queue.reason, "DATABASE_UNAVAILABLE");
});

test("queue inspection failure returns a bounded unhealthy check", async () => {
  const result = await evaluateReadiness(probes({
    inspectQueue: () => Promise.reject(new Error("queue table secret")),
  }));
  assert.equal(result.status, "unhealthy");
  assert.deepEqual(result.checks.queue, {
    status: "unhealthy",
    pendingJobs: null,
    deadLetters: null,
    reason: "INSPECTION_FAILED",
  });
});

test("database and Redis probes time out independently without hanging readiness", async () => {
  const started = Date.now();
  const result = await evaluateReadiness(probes({
    checkDatabase: () => new Promise(() => {}),
    checkRedis: () => new Promise(() => {}),
    timeoutMs: 10,
  }));
  assert.ok(Date.now() - started < 250);
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.database.status, "unhealthy");
  assert.equal(result.checks.redis.status, "unhealthy");
  assert.equal(result.checks.queue.reason, "DATABASE_UNAVAILABLE");
});

test("queue inspection timeout is contained after a healthy database probe", async () => {
  const started = Date.now();
  const result = await evaluateReadiness(probes({
    inspectQueue: () => new Promise(() => {}),
    timeoutMs: 10,
  }));
  assert.ok(Date.now() - started < 250);
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.queue.reason, "INSPECTION_FAILED");
});

test("dead letters keep readiness unhealthy while preserving bounded counts", async () => {
  const result = await evaluateReadiness(probes({
    inspectQueue: () => Promise.resolve({ pendingJobs: 3, deadLetters: 1 }),
  }));
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.queue.deadLetters, 1);
  assert.equal(result.checks.queue.reason, "DEAD_LETTERS_PRESENT");
});

test("dependency recovery returns readiness to ready", async () => {
  let available = false;
  const dependencies = probes({
    checkRedis: () => Promise.resolve(available),
  });
  assert.equal((await evaluateReadiness(dependencies)).status, "unhealthy");
  available = true;
  assert.equal((await evaluateReadiness(dependencies)).status, "ready");
});

test("readiness responses never serialize dependency exceptions or credentials", async () => {
  const secret = "postgresql://operator:password@database.internal/private";
  const result = await evaluateReadiness(probes({
    checkDatabase: () => Promise.reject(new Error(secret)),
    checkRedis: () => Promise.reject(new Error(`redis secret ${secret}`)),
    cacheHealth: () => { throw new Error(`cache secret ${secret}`); },
  }));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /operator|password|database\.internal|stack|Error/);
  assert.equal(result.timestamp, now().toISOString());
});

test("route-level fallback is structured and non-sensitive", () => {
  const result = unavailableReadiness(now());
  assert.equal(result.status, "unhealthy");
  assert.equal(result.checks.database.status, "unhealthy");
  assert.equal(result.checks.queue.pendingJobs, null);
  assert.doesNotMatch(JSON.stringify(result), /exception|stack|credential/i);
});
