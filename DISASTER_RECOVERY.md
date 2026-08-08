# Dublancer Enterprise v1.0 Disaster Recovery

## Recovery policy

The provided profile schedules an hourly database backup and a daily verification job. The initial operating targets are:

- Recovery point objective (RPO): 60 minutes for the primary database.
- Recovery time objective (RTO): 4 hours for a regional database restoration and controlled application recovery.
- Backup freshness acceptance: no older than 26 hours for the daily verification control.

These are policy targets, not claims about an untested environment. The deploying organization must prove them through scheduled exercises and adjust capacity/processes if they are missed.

## Protected state

Back up and inventory:

- PostgreSQL data and the applied Prisma migration identifier;
- encrypted application/identity/integration secrets through the approved secret manager's own versioned backup process;
- object/file storage and scan/version metadata according to the storage provider's replication policy;
- Redis only if the deployment uses it for durable state beyond the repository's database-backed fallbacks;
- deployment manifests, image digests/signatures, environment configuration checksum, collector/dashboard/alert configuration, DNS and certificate configuration;
- audit exports required by retention policy.

Never place plaintext database dumps, keys, tokens, or production environment files in the repository.

## Backup requirements

The Kubernetes template in `deploy/backup/backup-cronjob.yaml` is scheduled hourly with `concurrencyPolicy: Forbid`. The operator-supplied `dublancer-backup-scripts` ConfigMap and `dublancer-backup-secrets` Secret must implement:

1. a consistent PostgreSQL dump or provider snapshot;
2. encryption before the artifact leaves the controlled runtime;
3. SHA-256 checksum generation;
4. immutable/versioned upload to independent regional storage;
5. a JSON manifest containing `artifact`, `sha256`, `createdAt`, `region`, `migration`, and `encrypted: true`;
6. retention/legal-hold behavior and failure alerting.

Verify a downloaded artifact/manifest pair:

```bash
npm run verify:backup -- --manifest /restore/manifest.json --max-age-hours 26
```

This verifies manifest completeness, encryption declaration, freshness, checksum format, and artifact checksum. A successful artifact check does not replace a database restore exercise.
When no default `backup-manifest.json` is present, `--manifest` is required; first generate or download the encrypted artifact and its manifest through the backup workflow above. Set `BACKUP_VERIFY_DEBUG=1` only during controlled operator diagnosis when a stack trace is explicitly needed.

## Restore verification

`deploy/backup/restore-verification-cronjob.yaml` schedules the artifact control daily. The production recovery pipeline extends it with an isolated PostgreSQL target and must:

1. download the selected manifest and encrypted artifact from independent storage;
2. verify manifest signature/checksum and decrypt using a recovery-scoped key;
3. restore into an empty isolated database with no production network path;
4. run `npx prisma migrate status` and confirm the manifest migration exists;
5. execute integrity queries for tenants, users, roles, projects, contracts, finance ledgers, file versions, audit events, identity records, CRM/talent/knowledge/integration records, and background jobs;
6. run seed idempotency only when explicitly part of the exercise;
7. execute read-only application smoke tests against the isolated target;
8. destroy the isolated restore after evidence is retained according to policy.

Record artifact/manifest IDs, checksum, region, backup time, restore start/end, migration, row/integrity results, RPO/RTO achieved, operators, and exceptions.

## Regional database disaster

1. Declare an incident and freeze unsafe writes/traffic to the affected region.
2. Confirm whether the secondary database is consistent enough for promotion; compare replication position against the RPO.
3. Preserve primary logs/snapshots before mutation.
4. Promote the approved secondary or restore the selected immutable backup.
5. update secret-manager connection values and regional routing through reviewed changes;
6. run migration status—do not rerun or modify historical SQL manually;
7. start one region at minimal capacity and validate liveness/readiness, authentication, tenant isolation, core commercial flows, workers, and observability;
8. restore traffic gradually, then scale workers and optional federation;
9. reconcile writes, webhooks, jobs, emails, integrations, cache state, and audit exports from the incident window.

## Region or cluster loss

The secondary region uses the same signed image digest, migration history, and configuration version with region-specific endpoints. Activate it only after database readiness, secrets, Redis, collectors, workers, DNS/certificates, and alert delivery are verified. Drain the failed region before changing global traffic. Test regional cache invalidation after recovery.

## Redis loss

The application uses bounded Redis connections and database/local fallbacks where implemented. During an outage, expect degraded realtime/cache behavior. Restore Redis from the provider process if required, restart consumers gradually, invalidate tenant caches, confirm streams/notifications/chat presence behavior, and watch duplicate/retry evidence. Do not restore stale authorization cache entries.

## Search, telemetry, or provider loss

External search federation fails soft to local search. Telemetry exporter failure must not stop business requests but reduces diagnosis evidence and is an operations incident. Identity/payment/email/integration provider recovery follows each provider's reconciliation and signature/idempotency process; never replay unverified webhook bodies.

## Exercise schedule

- Daily: artifact freshness/checksum verification.
- Monthly: isolated database restore and integrity queries.
- Quarterly: application smoke against a restored database and regional traffic exercise.
- Annually: full incident simulation including communications, identity/secrets, database promotion/restore, backlog reconciliation, and post-incident review.

Any failed exercise opens a tracked resilience finding with an owner and deadline.
