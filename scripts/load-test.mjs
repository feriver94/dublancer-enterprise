import { performance } from "node:perf_hooks";

const target = new URL(process.env.LOAD_TEST_TARGET ?? "http://127.0.0.1:3000/api/health/live");
const concurrency = Math.min(
  Math.max(Number(process.env.LOAD_TEST_CONCURRENCY ?? 10), 1),
  500,
);
const durationSeconds = Math.min(
  Math.max(Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 10), 1),
  3_600,
);
const local = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
if (!local && process.env.ALLOW_EXTERNAL_LOAD_TESTS !== "1") {
  throw new Error("External load tests require ALLOW_EXTERNAL_LOAD_TESTS=1.");
}

const deadline = Date.now() + durationSeconds * 1_000;
const latencies = [];
let requests = 0;
let failures = 0;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(target, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Dublancer-Load-Test/1.0",
        },
      });
      clearTimeout(timeout);
      await response.arrayBuffer();
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - started);
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
latencies.sort((left, right) => left - right);
const percentile = (value) =>
  Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] ?? 0);
const report = {
  target: target.toString(),
  concurrency,
  durationSeconds,
  requests,
  failures,
  requestsPerSecond: Number((requests / durationSeconds).toFixed(2)),
  p50LatencyMs: percentile(0.5),
  p95LatencyMs: percentile(0.95),
  p99LatencyMs: percentile(0.99),
  maxLatencyMs: Math.round(latencies.at(-1) ?? 0),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (process.env.LOAD_TEST_RUN_ID && process.env.INTERNAL_WORKER_SECRET) {
  const controlUrl = new URL(
    "/api/internal/observability/evaluate",
    target.origin,
  );
  const response = await fetch(controlUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.INTERNAL_WORKER_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "COMPLETE_LOAD_TEST",
      runId: process.env.LOAD_TEST_RUN_ID,
      status: failures === 0 ? "PASSED" : "FAILED",
      ...report,
    }),
  });
  if (!response.ok) {
    throw new Error(`Load-test result callback returned HTTP ${response.status}.`);
  }
}

if (failures > Number(process.env.LOAD_TEST_MAX_FAILURES ?? 0)) {
  process.exitCode = 1;
}
