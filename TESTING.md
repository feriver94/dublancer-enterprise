# Sprint 29 Verification

## Browser release profile

Playwright intentionally does not start an implicit development server. Provision a disposable environment with native PostgreSQL and real Redis, apply all migrations, run the real seed, configure normal application secrets, build/start Dublancer, and confirm both `/api/health/live` and `/api/health/ready` are healthy. Then set the credential-free target URL and run the suite:

```bash
cp .env.playwright.example .env.playwright
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

The preflight uses bounded liveness/readiness probes and fails immediately with an actionable error when the URL, PostgreSQL, Redis or queue readiness is unavailable. It does not retry an unhealthy root page for two minutes. `PLAYWRIGHT_BASE_URL` may point to a prestarted CI environment, but must not contain credentials. Browser results are release evidence only when the actual configured engines launch and execute; discovery or simulated dependencies do not replace that gate.

## Dual-Profile Phase C verification

Run `npm test`, `npm run test:phase-c:runtime`, `npm run test:phase-a:runtime` and `npm run test:phase-b:runtime`. Phase C static tests cover persona marketplace controls, separate actions, contracts, reviews/reputation, live search, AI governance and conflict recovery. The Phase C runtime replays all 21 migrations on a fresh PostgreSQL-compatible database and tests its constraints; the enhanced Phase B application runtime exercises immediate project search, public provider search, invite/proposal/award/acceptance and directional reputation flows on the Phase C schema. `npm run test:phase4:runtime` preserves indexed-search pagination/highlights and cross-tenant behavior. Native PostgreSQL CI must additionally run `npx prisma migrate deploy`.

## Dual-Profile Phase B verification

Run `npm test` for Phase B privacy, CRUD, completion, dashboard, ownership, authorization, localization and responsive UI contracts. Run `npm run test:phase-b:runtime` for a new 20-migration database, exact seed, live two-account tenant isolation, fresh three-persona onboarding, public/hidden profiles, all content families, conflicts, dashboards and organization publication.

Standard Prisma validate/generate/deploy, seed, TypeScript, ESLint, build, security, migration, locale, secret and aggregate release gates remain mandatory. The runtime verifier uses chronological SQL replay because Prisma's schema engine cannot target the PGlite socket available in this container; native PostgreSQL environments must additionally execute `npx prisma migrate deploy`.

## Phase A verification

```powershell
npm.cmd test
npm.cmd run test:phase-a:runtime
npm.cmd run verify:migrations
npm.cmd run verify:locales
npm.cmd run verify:security
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The Phase A runtime uses a new PostgreSQL-compatible database, applies all 19 chronological migrations, runs the real seed, boots the live application and proves one-account/three-persona onboarding, activation, session-bound switching, cross-account denial and persona-plus-RBAC marketplace authorization.

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
