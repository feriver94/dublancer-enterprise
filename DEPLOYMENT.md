# Deployment

## Phase C rollout

Deploy the additive `20260802100000_dual_profile_marketplace_phase_c` migration before Phase C web/workers. Do not backfill synthetic contract personas or reviews. Existing contracts remain compatible; monitor `CONTRACT_PERSONA_MISMATCH`, invitation conflicts, search synchronization warnings and AI policy-unavailable results. Search workers and Redis remain valuable accelerators, but current project/profile correctness no longer depends on worker availability because canonical live read-through is authoritative. Roll back application code without reversing the additive migration, then correct forward if needed.

## Overview

Defines CI/CD pipeline, deployment workflow, rollback strategy, and release process.

## Standalone production startup

The repository builds Next.js with `output: "standalone"`. For a non-container deployment, run `npm run build` and then `npm start`. The start script prepares `public` and `.next/static` beneath `.next/standalone` and launches the supported server command:

```bash
node .next/standalone/server.js
```

Set `HOSTNAME` and `PORT` in the process environment as required. The Docker image already copies the same public/static assets into its standalone runtime root and starts `server.js` directly, so its architecture is unchanged. Do not use `next start` with this repository.

## Coordinated release procedure

1. Provision PostgreSQL/Redis and provider credentials from `.env.example`; keep credentials in the deployment secret manager.
2. Back up PostgreSQL and test restore. Run `npm.cmd ci`, `npx.cmd prisma validate`, `npx.cmd prisma generate`, and `npm.cmd run verify:release` in CI.
3. Apply committed migrations with `npx.cmd prisma migrate deploy`; optionally run `npx.cmd prisma db seed` for idempotent reference data.
4. Deploy the same immutable application artifact to web and worker environments. Configure realtime publisher, chat retention, AI worker, scanner/index/export/notification workers, and reconciliation schedules.
5. Register the exact payment webhook URL/secret, enforce TLS, set storage CORS/checksum rules, enable malware scanning, and test provider callbacks in sandbox accounts.
6. Run authenticated tenant-isolation smoke tests in both locales and exercise SSE reconnect, notification delivery, file quarantine, AI approval, invoice idempotency, webhook replay, and export expiry.
7. Observe error rate, job lag/dead letters, Redis connections, database saturation, provider latency, webhook failures, and security events before increasing traffic.

Rollback the application artifact first. Database changes are additive; keep them during rollback. Use a reviewed forward migration for schema correction rather than editing or reverting an applied migration.
