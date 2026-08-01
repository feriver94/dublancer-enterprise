# Dublancer Enterprise v1.0 Operations Runbook

## Ownership model

Every production environment assigns named owners for application on-call, database, Redis/realtime, identity, security incident response, integrations, networking/DNS, observability, and release management. Alert receivers in `deploy/observability/alertmanager.example.yaml` are templates; replace them with approved destinations and verify delivery before accepting production traffic.

## Service objectives

Repository alert/load profiles use these initial objectives:

| Signal | Objective / trigger |
| --- | --- |
| HTTP failures | Under 1%; critical when 5xx ratio exceeds 1% for 10 minutes |
| HTTP latency | p95 under 750 ms; warning above 750 ms for 15 minutes |
| Load-test p99 | Under 1,500 ms |
| Search p95 | Under 500 ms in the capacity scenario |
| Readiness | Available in every serving region; critical after 5 minutes unavailable |
| Queue backlog | Warning above 100 pending jobs for 10 minutes |
| Dead letters | Critical on any new dead-letter job |
| Cache invalidation | Warning on any regional delivery failure in 10 minutes |

Tune objectives only through an approved SLO review backed by production evidence.

## Dashboards and endpoints

- Platform overview: `deploy/observability/grafana-platform-overview.json`
- Performance/capacity: `deploy/observability/grafana-performance.json`
- Liveness: `/api/health/live`
- Readiness: `/api/health/ready`
- Database health: `/api/health/database`
- Prometheus metrics: `/api/observability/metrics`
- Permission-protected operations: `/api/observability/dashboard`, `/api/observability/capacity`, `/api/operations/summary`, `/api/operations/workers`, `/api/operations/jobs`

## Routine checks

### Each shift

- Review open critical/warning alerts and the error-budget trend.
- Check regional readiness, deployment version, database/Redis health, worker heartbeat, oldest queue job, dead letters, integration deliveries, and cache invalidation failures.
- Confirm the latest backup/manifest is encrypted, checksum-valid, and within the accepted age.

### Daily

- Review SLO evaluations, performance profiles, search latency/result counts, scaling recommendations, security events, audit-export status, failed email/integration deliveries, and restore-verification results.
- Confirm certificate, identity-provider, API-key, OAuth-token, and privileged-access expirations are not approaching policy limits.

### Weekly

- Review dependency/Dependabot results, capacity trends, access reviews, dead-letter recovery evidence, regional failover readiness, backup retention, and alert receiver tests.

## Incident command

1. Acknowledge the alert and assign an incident commander, operations lead, communications lead, and subject-matter owners.
2. Record start time, affected regions/tenants, release SHA/image digest, symptoms, and customer impact.
3. Stabilize service with the least destructive reversible action.
4. Preserve logs, traces, metrics, audit events, job/delivery evidence, and database/infra timelines.
5. Communicate at the severity-specific cadence.
6. Verify recovery against health, SLO, customer journey, and backlog criteria.
7. Complete a blameless review with corrective owners and dates.

## High error rate

1. Compare 5xx by route, region, version, tenant class, and dependency.
2. Correlate traces/logs with the last deployment, migration, feature/config change, worker surge, and provider failures.
3. If one region is unhealthy, drain it gradually while confirming secondary capacity.
4. If release-correlated, roll back to the previous signed image or blue deployment. Do not reverse Phase 10 indexes.
5. If database-correlated, stop risky writes and involve the database owner.
6. Resolve only after 5xx is below objective for the observation window and critical journeys pass.

## High latency

1. Inspect p50/p95/p99 by route and region, queue age, database query/profile evidence, Redis latency, search federation, and external providers.
2. Disable or isolate a failing optional federated search peer; local search remains authoritative.
3. Scale web/workers within tested limits if CPU/memory/queue evidence supports it.
4. Capture a bounded performance profile before changing indexes or query plans.
5. Resolve after p95 remains below objective and saturation/backlog recovers.

## Readiness unavailable

1. Check liveness separately. A live-but-not-ready instance must not receive traffic.
2. Inspect database, Redis, identity/provider, and configured readiness dependency status.
3. Confirm secrets/config maps and regional endpoints match the release.
4. Restart only an identified failed instance; avoid simultaneous regional restarts.
5. If dependency recovery exceeds the service threshold, activate regional failover.

## Queue backlog or dead letters

1. Identify queue, job type, oldest age, attempts, lease owner, and error code.
2. Check active worker heartbeats and concurrency before scaling.
3. Recover/retry through the governed operations API/UI; never edit job status directly.
4. Quarantine poison messages and preserve their payload classification/audit evidence.
5. Confirm backlog drains, oldest age returns to baseline, and no duplicate side effect occurred.

## Cache invalidation failure

1. Confirm local invalidation succeeded and identify failed destination region from metrics/logs.
2. Verify HTTPS, DNS, `CACHE_INVALIDATION_SECRET`, peer URL, NetworkPolicy, and regional route health.
3. Re-run the tenant mutation only if its business operation is idempotent; otherwise wait for TTL/reconciliation.
4. Consider draining a region if stale authorization/business data could cause harm.
5. Resolve after bidirectional invalidations pass and stale entries expire.

## External search federation failure

Federation fails soft and local indexed search remains authoritative. Check endpoint health, token, TLS, timeout, and provider response schema. Do not weaken tenant/permission/project/file filters to restore availability. Disable the failed endpoint until it returns valid bounded responses.

## Identity or privileged-access incident

Revoke affected sessions/devices, disable the provider or SCIM token, invalidate relevant API keys, close PAM grants, preserve audit evidence, and follow the security communications process. Do not bypass MFA/AAL2/PAM to restore general availability.

## Backup or restore-verification failure

Treat a missing, stale, unencrypted, or checksum-invalid backup as a high-severity resilience incident. Stop retention deletion, preserve artifacts/logs, run a new backup in the primary and secondary storage path, and complete a clean isolated restore before closing. Follow `DISASTER_RECOVERY.md`.

## Post-incident acceptance

Record impact, root cause, timeline, contributing controls, customer/data/security implications, recovery evidence, whether RPO/RTO/SLO were met, corrective actions, owners, dates, runbook/test changes, and follow-up verification.
