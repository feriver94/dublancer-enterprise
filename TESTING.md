# Sprint 29 Verification

Run the committed PowerShell verifier:

```powershell
.\VERIFY_SPRINT_29.ps1
```

It performs deterministic dependency installation, Prisma schema validation/client generation, strict TypeScript checking, blocking ESLint checks, and a full Next.js production build. Add `-ApplyMigration` against a disposable integration database to exercise all committed migrations.

## Recommended API integration cases

1. Reject unauthenticated and missing-CSRF mutations.
2. Reject cross-organization channel IDs without disclosing channel existence.
3. Verify private, project, and organization visibility for owner/manager/member/viewer roles.
4. Retry a message with the same `clientMessageId` and confirm one row/event.
5. Race two edits with the same `expectedVersion` and confirm one `409 CONFLICT`.
6. Reconnect with `afterSequence` and confirm strict ascending catch-up without gaps.
7. Confirm direct-channel deduplication and immutable membership.
8. Confirm final-owner demotion/removal is blocked.
9. Verify notification-level, mute, and Sprint 28 preference suppression.
10. Exceed each Redis rate limit and confirm `429 RATE_LIMITED`.
11. Run retention against old threads with and without recent replies.
12. Subscribe to an unauthorized channel topic and confirm the SSE request is rejected before Redis subscription.

## Coordinated release automation

```powershell
npm.cmd run verify:locales
npm.cmd run verify:security
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

`npm test` checks required Prisma domains, the committed additive migration/RBAC content, and absence of embedded provider credentials. The locale verifier checks deep message-key parity and Arabic content. The security verifier scans every API route and rejects browser-header tenant context plus missing CSRF on coordinated product mutations.

With a disposable PostgreSQL/Redis/provider sandbox, add tests for migration deploy/seed idempotency; organization leakage; RBAC matrices; concurrent proposal/contract/invoice/idempotency writes; signed upload expiration/checksum/scanner callbacks; quarantined download refusal; AI approval, budget and worker retry/dead-letter; payment HMAC/replay and settlement reconciliation; search deletion freshness; RTL keyboard/screen-reader journeys; notification/SSE reconnect; load, backup restore, and regional failover.

Run `.\VERIFY_FINAL_RELEASE.ps1 -ApplyMigration -Seed` to include committed migration and reference-data activation against the configured database.
