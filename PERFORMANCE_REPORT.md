# Dublancer Enterprise v1.0 Performance Report

## Scope

Phase 10 converts the Phase 8 performance/scaling evidence into production configuration and closes the remaining regional cache/search and capacity-reporting gaps. This report defines testable targets and repository evidence; it does not claim a universal throughput number independent of provisioned infrastructure.

## Performance objectives

The committed k6 profile enforces:

- HTTP failure rate below 1%.
- Capacity failure rate below 1%.
- HTTP p95 below 750 ms.
- HTTP p99 below 1,500 ms.
- Search p95 below 500 ms.

The scenario ramps arrival rate from 5 requests/second to 25, then 100, and back to 25, with 20 preallocated and 200 maximum virtual users. Environments must establish their own sustained/peak capacity and error-budget margins using production-equivalent data, network, database, Redis, worker, and provider topology.

## Implemented optimizations

### Database

Migration `20260730150000_enterprise_production_performance` adds eight indexes for:

- tenant search duration and result-count time series;
- tenant performance-profile status/operation/duration analysis;
- load-test completion history;
- tenant/queue/status/priority/availability worker claims;
- worker status/heartbeat freshness;
- tenant integration-run availability.

The migration is index-only and contains no destructive SQL.

### Cache and search

- Local tenant invalidation always occurs before optional regional propagation.
- Peer fan-out is concurrent, each peer has a 1.5 second bound, production requires HTTPS, and remote requests cannot re-propagate.
- Failed peers emit metrics/logs without rolling back the originating business mutation.
- Local PostgreSQL search remains authoritative. Federation fills only unused first-page slots, is disabled for cursor pages, has a 100–3,000 ms configurable bound, validates at most 100 returned items, reapplies tenant/authorization filters, deduplicates, and fails soft.

### Workers and autoscaling

- Worker batches are clamped to 1–25 operations and process sequentially to preserve established leasing/idempotency behavior.
- Batch size/duration, queue pending count, oldest job age, active workers, dead letters, profiles, search latency, and recommendations feed capacity evidence.
- Kubernetes HPA uses CPU and memory signals with scale-up/down stabilization; PodDisruptionBudget and zero-unavailable rolling policy protect capacity during release.

## Capacity reporting

`GET /api/observability/capacity` requires `observability.read` and reports deployment region/version, worker status, queue pending/processing/dead-letter counts and oldest age, per-operation p50/p95/p99, search p95/result average, cache health/peer count, scaling recommendations, and load-test history.

Grafana dashboards and Prometheus rules consume the corresponding metrics. Capacity data is tenant scoped or global only where the underlying operational record is intentionally global.

## Load-test procedure

1. Use a production-equivalent isolated environment and synthetic/non-personal data.
2. Apply all 18 migrations and the release seed.
3. Warm the application, database plans, Redis, and search index.
4. Supply a dedicated test session/CSRF token with least privilege.
5. Run:

```bash
TARGET_URL=https://load.example.invalid \
SESSION_COOKIE='<ephemeral test session>' \
CSRF_TOKEN='<ephemeral csrf token>' \
k6 run deploy/load-testing/k6-capacity.js
```

6. Capture image/commit/migration, regions, replica/worker counts, database/Redis tiers, dataset size, test stages, latency/failure results, saturation, queue age, cache/search/provider failures, and cost.
7. Store the governed load-test evidence and scaling recommendation; remove ephemeral credentials.

## Current verification evidence

- Static performance contracts: passed.
- 18-migration additive/index verification: passed.
- Prisma validate/generate: passed.
- Next.js production build after dependency upgrades: 301/301 generation units.
- Existing Phase 3–9 runtime performance thresholds remain part of the final compatibility gate.
- Production capacity number: intentionally not stated until an operator runs the committed profile on a named topology.

## Capacity decision rules

Scale only when multiple signals agree: rising arrival rate, saturation, latency, queue age/backlog, and worker availability. Prefer query/plan correction before permanent brute-force scaling. Never remove tenant/permission filters, idempotency, leases, signatures, validation, or audit controls to improve a benchmark.
