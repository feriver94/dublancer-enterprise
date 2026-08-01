# Dublancer Enterprise v1.0 Deployment Guide

## Supported release profile

- Node.js: 24.x
- npm: 11.x (audited lock generated with 11.9.0)
- Container: OCI runtime capable of running the standalone Next.js image as UID/GID 1001
- Database: production PostgreSQL compatible with all 18 Prisma migrations
- Cache/realtime: Redis over a protected network path
- Orchestrator: Kubernetes with `apps/v1`, `autoscaling/v2`, NetworkPolicy, PodDisruptionBudget, and Kustomize support
- Regions in the provided profile: `uae-north` primary and `europe-west` disaster-recovery/secondary

Managed platform versions, storage classes, ingress controllers, DNS, certificates, and secret stores are operator choices and must be validated before release approval.

## Required configuration

The production environment validator requires:

| Category | Variables |
| --- | --- |
| Core | `NODE_ENV=production`, `DEPLOYMENT_ENVIRONMENT=production`, `APP_VERSION`, `APP_BASE_URL`, `DATABASE_URL`, `REDIS_URL` |
| Authentication | `AUTH_SECRET`, `IDENTITY_ENCRYPTION_KEY`, `MFA_BACKUP_CODE_PEPPER`, `INTEGRATION_API_KEY_PEPPER` |
| Internal trust | `INTERNAL_PUBLISHER_SECRET`, `INTERNAL_NOTIFICATION_SECRET`, `INTERNAL_EMAIL_SECRET`, `INTERNAL_WORKER_SECRET`, `CACHE_INVALIDATION_SECRET` |
| Regions | `DEPLOYMENT_REGION`, `DEPLOYMENT_REGIONS`, `DISASTER_RECOVERY_REGION` |
| Telemetry | `OTEL_EXPORTER_OTLP_ENDPOINT` |

All secret/pepper values must contain at least 32 characters and originate in an approved secret manager. `APP_BASE_URL` and WebAuthn origins use HTTPS in production. The primary and disaster-recovery regions must differ and both must appear in `DEPLOYMENT_REGIONS`.

Optional regional scaling/federation settings include `CACHE_INVALIDATION_PEERS`, `SEARCH_FEDERATION_ENDPOINTS`, `SEARCH_FEDERATION_TOKEN`, and `SEARCH_FEDERATION_TIMEOUT_MS`. Peer/federation endpoints use HTTPS in production.

Validate without printing secrets:

```bash
npm run verify:environment -- --file /secure/path/dublancer-production.env --profile production
npm run verify:production-config
npm run verify:supply-chain
npm run audit:production
```

## Build an immutable image

Build from the verified release commit and record the digest:

```bash
docker build --pull --tag ghcr.io/feriver94/dublancer-enterprise:1.0.0 .
docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/feriver94/dublancer-enterprise:1.0.0
```

The `Dockerfile` installs from `package-lock.json`, builds the standalone Next.js output, copies only runtime assets, drops privileges, and exposes port 3000. Sign and scan the image according to organizational policy. Deploy by digest, not by a mutable tag.

## Database release procedure

1. Confirm the current encrypted backup is within the accepted RPO and passes `npm run verify:backup -- --manifest <manifest>`.
2. Confirm the database target and change window with two operators.
3. Run migration status and deploy:

```bash
npx prisma migrate status
npx prisma migrate deploy
npm run seed
```

4. Confirm the final migration is `20260730150000_enterprise_production_performance`.
5. Do not edit, squash, delete, or reorder historical migration directories.

The Phase 10 migration creates indexes only. Application rollback does not require schema rollback.

## Rolling deployment

Render each overlay and inspect the result before applying:

```bash
kubectl kustomize deploy/kubernetes/overlays/uae-north > /secure/review/uae-north.yaml
kubectl kustomize deploy/kubernetes/overlays/europe-west > /secure/review/europe-west.yaml
kubectl diff -f /secure/review/uae-north.yaml
kubectl apply -f /secure/review/uae-north.yaml
kubectl rollout status deployment/dublancer-enterprise --timeout=10m
```

Repeat for Europe West after UAE North passes smoke and telemetry checks. Replace the image with the signed digest through the deployment pipeline before `apply`.

The rolling profile keeps `maxUnavailable: 0`, adds one surge replica, waits for readiness, spreads replicas across zones, and allows 45 seconds for termination.

## Blue/green deployment

1. Apply base resources and the green profile with the new digest.
2. Wait until all green replicas are ready.
3. Exercise the preview service using internal DNS/ingress.
4. Run database-independent and authenticated smoke journeys, then:

```bash
node scripts/release-smoke.mjs https://preview.example.invalid 1.0.0
```

5. Compare green and blue error, latency, queue, cache, and dependency metrics for at least one agreed observation window.
6. Change the production Service selector from `release-color: blue` to `release-color: green` through a reviewed manifest change.
7. Verify all regional routes and preserve blue until the rollback window closes.

Do not send production traffic to green before migrations are complete and readiness is healthy.

## Multi-region release sequence

1. Freeze writes that cannot tolerate regional failover if required by the database topology.
2. Deploy/migrate the primary region.
3. Verify primary health, telemetry, worker queues, and cache invalidation delivery.
4. Deploy the secondary region using the same image digest and configuration version.
5. Run health/version smoke checks in each region.
6. Test cache invalidation in both directions and a bounded federated-search failure.
7. Enable weighted traffic gradually; confirm error budget and replication health after each change.
8. Record the release, digest, migration, environment checksum, operators, and timestamps.

## Release verification

For each region:

```bash
node scripts/release-smoke.mjs https://region.example.invalid 1.0.0
curl --fail --silent https://region.example.invalid/api/health/live
curl --fail --silent https://region.example.invalid/api/health/ready
```

Then confirm:

- version and region labels are correct;
- readiness reports required dependencies accurately;
- Prometheus scrapes `/api/observability/metrics`;
- traces/logs/metrics reach the configured collector/exporters;
- Alertmanager test notifications reach warning and incident receivers;
- workers are online and queue age is bounded;
- backup and restore-verification jobs are scheduled;
- cache peers and external search providers are configured as intended;
- dashboards show the new release without a regression.

## Rollback

For an application regression, restore the previous signed image digest and roll out normally. Preserve the additive Phase 10 indexes. For blue/green, return the Service selector to blue. If a migration or data issue is suspected, stop the release, preserve evidence, engage the database owner, and follow `DISASTER_RECOVERY.md`; never improvise destructive SQL.

## Deployment acceptance record

Capture release SHA/tree, image digest/signature, database migration, backup manifest/checksum, environment-validation result, regional smoke results, dashboards/alerts checked, traffic-switch time, rollback deadline, incident commander, release manager, and database/security approvers.
