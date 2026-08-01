# Dublancer Enterprise v1.0 Release Notes

## Release identity

Dublancer Enterprise v1.0 is the cumulative result of the audited Phase 1 foundation and Phases 2–10. Phase 10 starts from authoritative Phase 9 commit `5270e948dfbb570ca5ec8acb2f606ee9a48497f3`; its final release commit and tree are recorded in `PHASE10_IMPLEMENTATION_REPORT.md` after the complete release gate.

This release is backward compatible with the Phase 9 API, permission, migration, and UI contracts. Phase 10 adds production configuration, operational controls, performance infrastructure, frontend consolidation, and security hardening without removing an existing API or redesigning a completed product domain.

## What is included

### Production deployment

- Standalone, non-root, multi-stage container build.
- Kubernetes rolling deployment with zero unavailable replicas, startup/readiness/liveness probes, topology spreading, PodDisruptionBudget, NetworkPolicy, and a least-privilege service account.
- UAE North and Europe West regional overlays.
- Horizontal autoscaling with stabilization controls.
- Blue/green preview deployment and service profile.
- Production environment, configuration, backup-manifest, and release-smoke verifiers.
- Hourly backup and daily restore-verification scheduling templates.

### Observability and operations

- OpenTelemetry Collector pipelines for traces, metrics, and logs with batching, memory limiting, tail sampling, OTLP export, and Prometheus remote write.
- Prometheus availability, latency, readiness, queue, dead-letter, and cache-invalidation alerts.
- Alertmanager operations and critical-incident receivers.
- Grafana platform and performance dashboards.
- SLO, capacity, worker, cache, search, and load-test evidence exposed through existing permission-protected observability APIs.
- Operational, incident-response, deployment, and disaster-recovery runbooks.

### Performance and regional resilience

- Authenticated, loop-safe multi-region tenant cache invalidation.
- Permission- and tenant-filtered external search federation used only as a bounded local-search fallback.
- Additive hot-path database indexes in migration `20260730150000_enterprise_production_performance`.
- Bounded worker batch processing and capacity metrics.
- k6 ramping-arrival-rate scenarios with p95/p99 latency and failure thresholds.
- Autoscaling and capacity-report configuration.

### Frontend and quality consolidation

- Canonical live administration, payments, AI governance, and orchestration surfaces replace the remaining generic product-console entry points while legacy URLs remain compatible.
- Live orchestration definition, publication, run, and approval UI.
- Organization-backed project member picker, guarded role updates, safe removal, and immutable project-owner handling.
- Bilingual `en-AE` and `ar-AE` additions with RTL-safe layouts.
- Playwright coverage for Chromium, Firefox, WebKit, and mobile Chromium.
- axe WCAG A/AA, keyboard-focus, responsive-overflow, and UI-consistency automation.

### Dependency and supply-chain security

- Compatible upgrades for Prisma 7.9.1, React 19.2.8, Tailwind 4.3.3, `next-intl` 4.13.4, JOSE 6.2.6, and related tooling.
- Patched PostCSS, Sharp, fast-uri, and brace-expansion dependency lines.
- Zero npm advisories across production and development dependency graphs at the Phase 10 hardening checkpoint.
- npm 11.9 and Node.js 24 release-line pinning.
- Lockfile v3 registry-source and SHA-512 integrity enforcement.
- Eight reviewed dependency lifecycle scripts; all other install scripts fail verification.
- Dependabot and scheduled supply-chain verification.

## Data and migrations

Phase 10 adds one chronological, additive, index-only migration:

- `20260730150000_enterprise_production_performance`

No table, column, enum, API, permission, or historical migration is removed or rewritten. All 18 migrations remain ordered. Existing Phase 9 data requires no destructive backfill.

## Upgrade notes

1. Read `DEPLOYMENT_GUIDE.md`, `SECURITY_BASELINE.md`, and `DISASTER_RECOVERY.md`.
2. Back up the Phase 9 database and verify the encrypted artifact and manifest.
3. Validate production environment values with `npm run verify:environment -- --file <path> --profile production`.
4. Run `npx prisma migrate deploy` against the target database.
5. Deploy the image by digest with a rolling or blue/green profile.
6. Run `node scripts/release-smoke.mjs <base-url> 1.0.0` in every region.
7. Confirm dashboards, alert delivery, cache peers, search federation, workers, and backup verification.

Application rollback is safe because the Phase 10 database migration is additive. Do not reverse or delete the index migration during an incident; deploy the previous compatible image and investigate separately.

## Known operational boundaries

The repository provides validated deployment and operations templates, not a hosted production control plane. DNS, certificates, managed PostgreSQL/Redis, backup object storage, encryption keys, OTLP/Prometheus/Grafana endpoints, alert receiver URLs, and regional traffic management must be supplied and exercised by the deploying organization.

Physical authenticator lab coverage, provider-specific federation/SCIM certification suites, vendor-specific integration connector packs, and active-active database failover remain environment/vendor programs rather than repository release blockers. These boundaries are detailed in `FINAL_ENTERPRISE_AUDIT.md`.
