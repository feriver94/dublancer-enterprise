# Deployment

## Overview

Defines CI/CD pipeline, deployment workflow, rollback strategy, and release process.

## Coordinated release procedure

1. Provision PostgreSQL/Redis and provider credentials from `.env.example`; keep credentials in the deployment secret manager.
2. Back up PostgreSQL and test restore. Run `npm.cmd ci`, `npx.cmd prisma validate`, `npx.cmd prisma generate`, and `npm.cmd run verify:release` in CI.
3. Apply committed migrations with `npx.cmd prisma migrate deploy`; optionally run `npx.cmd prisma db seed` for idempotent reference data.
4. Deploy the same immutable application artifact to web and worker environments. Configure realtime publisher, chat retention, AI worker, scanner/index/export/notification workers, and reconciliation schedules.
5. Register the exact payment webhook URL/secret, enforce TLS, set storage CORS/checksum rules, enable malware scanning, and test provider callbacks in sandbox accounts.
6. Run authenticated tenant-isolation smoke tests in both locales and exercise SSE reconnect, notification delivery, file quarantine, AI approval, invoice idempotency, webhook replay, and export expiry.
7. Observe error rate, job lag/dead letters, Redis connections, database saturation, provider latency, webhook failures, and security events before increasing traffic.

Rollback the application artifact first. Database changes are additive; keep them during rollback. Use a reviewed forward migration for schema correction rather than editing or reverting an applied migration.
