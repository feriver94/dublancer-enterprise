# Dublancer QA Bug Register

## Summary

Original audited product commit: `5b236e691294b4b8f095ab0673b3b7488ede8a17`

Bug-fix sprint starting commit: `250f2e15da7a21c3930cd6c9a1cc0589bfe06f5d`

Retest date: 2026-08-08

| Resolution | Count |
|---|---:|
| FIXED | 7 |
| OPEN | 0 |
| **Total** | **7** |

Environment blockers are recorded after the defect register and are not counted as product defects.

All seven repository defects have passing non-blocked regression evidence. Native PostgreSQL, real Redis, installed Playwright browsers, production credentials and operator-supplied backup evidence remain environment gates, not product passes.

## QA-001 — Readiness returns opaque HTTP 500 during database outage

| Field | Evidence |
|---|---|
| Bug ID | `QA-001` |
| Severity | HIGH |
| Module | Platform reliability / health |
| Route | `GET /api/health/ready` |
| Persona | Anonymous/system probe |
| Environment | Development and optimized production build; PostgreSQL intentionally unavailable |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Configure a syntactically valid `DATABASE_URL` that points to an unavailable PostgreSQL endpoint.
2. Start either `npm run dev` or the optimized production server.
3. Request `GET /api/health/ready`.
4. Compare the response with `GET /api/health/database`.

### Expected result

Readiness should return a bounded HTTP 503 with a structured non-sensitive JSON health payload identifying the database/queue dependency as unhealthy. A known dependency outage should not escape as an unhandled exception.

### Actual result

`/api/health/ready` returns HTTP 500 with an empty body. Server logs contain Prisma P1001/P2010 exceptions. `/api/health/database` correctly returns HTTP 503 and:

```json
{"status":"unhealthy","latencyMs":86,"checkedAt":"<timestamp>"}
```

### HTTP/API evidence

```text
GET /api/health/ready -> HTTP/1.1 500 Internal Server Error
Content-Type: absent
Body: empty
```

```text
GET /api/health/database -> HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Body: {"status":"unhealthy",...}
```

### Console error

```text
PrismaClientKnownRequestError P1001:
Can't reach database server at 127.0.0.1:5432
at prisma.backgroundJob.count(...)
at PlatformReliabilityService.systemHealth(...)
```

### Likely root cause

`PlatformReliabilityService.systemHealth()` calls `checkDatabaseHealth()` and two direct `prisma.backgroundJob.count()` operations in the same `Promise.all`. The bounded database check handles failure, but the direct queue counts reject the entire promise before the route can return its intended unhealthy status.

### Recommended fix

Guard queue counts when database health is unavailable, or use bounded per-check error handling/`Promise.allSettled`. Preserve a structured 503 response and avoid returning exception details to clients.

### Regression risk

Moderate. Health/readiness behavior affects load balancers, orchestration, rolling deployment and incident response. Add tests for database down, Redis down, both down and recovery.

### Fix verification

Readiness now evaluates database and Redis checks independently with per-probe deadlines, skips queue inspection when the database is unavailable, contains and bounds queue failures, and returns only structured non-sensitive output. Eleven focused tests cover healthy, database-down, Redis-down, both-down, dependency timeout, queue failure/timeout, dead-letter, recovery and sanitization paths. A production standalone smoke test returned `503` from both `/api/health/ready` and `/api/health/database` with an unreachable database, while `/api/health/live` remained `200`. The Phase 8 supplemental runtime also verified Redis-down readiness as a structured `503`.

## QA-002 — Browser suite does not cover authenticated end-to-end workflows

| Field | Evidence |
|---|---|
| Bug ID | `QA-002` |
| Severity | HIGH |
| Module | Browser QA / release assurance |
| Routes | Authenticated product surface |
| Persona | Client, freelancer, organization, enterprise member |
| Environment | `tests/browser/accessibility.spec.ts`, Playwright config |
| Status | **FIXED IN REPOSITORY — browser execution remains ENV-003 BLOCKED** |

### Steps to reproduce

1. Run `npx playwright test --list`.
2. Inspect all 36 discovered cases.
3. Compare them with the production audit's required authentication, persona, profile, marketplace, contract, payment, file, chat and dashboard workflows.

### Expected result

The production browser suite should exercise critical authenticated end-to-end journeys, persona switching, public/private profile transitions, marketplace award, contract sides, dashboard data, real browser keyboard behavior, RTL, dark/light and responsive layouts.

### Actual result

All 36 configured tests cover only `/`, `/login`, `/register`, `/pricing` and primary public-navigation keyboard focus across four projects. No authenticated end-to-end product flow is configured.

### HTTP/API evidence

Not an API failure. Discovery output reports 9 cases per browser project, all sourced from one public accessibility specification.

### Console error

None. This is a coverage gap.

### Likely root cause

The Phase 10 browser suite was designed as a public accessibility/responsive smoke layer rather than a full release-regression layer.

### Recommended fix

Add deterministic browser fixtures and authenticated journeys for the release-critical flows. Keep API runtime harnesses, but do not treat them as visual/browser substitutes.

### Regression risk

High release-assurance risk. API behavior can pass while navigation, hydration, focus, form state, localization or responsive UX fails.

### Fix verification

`tests/browser/authenticated-release.spec.ts` adds a deterministic authenticated release-critical journey covering registration, login/logout/session persistence, three client personas, freelancer onboarding and switching, listing/proposal edit-withdraw-shortlist-award flows, optimistic concurrency, both contract sides, milestones, review denial/duplication/dimensions/cross-tenant controls, public/hidden profiles, both dashboards, exact-title search, keyboard navigation, English LTR, Arabic RTL and mobile viewport bounds. Discovery now reports 40 cases across Chromium, Firefox, WebKit and Mobile Chromium. Actual browser execution is not marked passed because the browser installer is blocked by truncated downloads.

## QA-003 — Default Playwright web server is not self-contained on a clean checkout

| Field | Evidence |
|---|---|
| Bug ID | `QA-003` |
| Severity | MEDIUM |
| Module | Playwright harness / local QA setup |
| Route | Default `webServer` startup and `/` probe |
| Persona | Anonymous |
| Environment | Clean checkout with no `.env` and no native services |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Run `npm ci` in a clean checkout.
2. Do not create a local `.env`.
3. Run `npx playwright test`.

### Expected result

The harness should either provision documented disposable dependencies, consume an explicit prestarted base URL, or fail immediately with a concise environment-validation message.

### Actual result

The configured web server starts `npm run dev`, repeatedly requests `/`, and logs `DATABASE_URL environment variable is not configured.` until the server timeout. In this restricted runner it also logs the known `uv_resident_set_memory` telemetry limitation.

### HTTP/API evidence

The public root cannot become a healthy Playwright web-server target without a database URL, so no browser assertion starts.

### Console error

```text
Error: DATABASE_URL environment variable is not configured.
at src/lib/database/prisma.ts:7
```

### Likely root cause

`playwright.config.ts` launches the application but does not run the repository environment validator or establish a database/Redis lifecycle. Local setup requirements are implicit.

### Recommended fix

Provide an explicit documented browser-test profile and setup/teardown command for disposable native services, or require `PLAYWRIGHT_BASE_URL` and validate it before test discovery.

### Regression risk

Low product-behavior risk; medium CI/local reproducibility risk.

### Fix verification

Playwright now requires an explicit absolute `PLAYWRIGHT_BASE_URL`, starts no implicit development server, and runs bounded liveness/readiness preflight checks against a prestarted environment. With the variable absent it exits immediately with an actionable `TESTING.md` reference. `.env.playwright.example` and the browser release-profile documentation make native PostgreSQL, real Redis and browser prerequisites explicit.

## QA-004 — Production start script conflicts with standalone output mode

| Field | Evidence |
|---|---|
| Bug ID | `QA-004` |
| Severity | MEDIUM |
| Module | Build/deployment scripts |
| Route | Production process startup |
| Persona | System |
| Environment | Optimized production build |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Run `npm run build`.
2. Run `npm run start`.

### Expected result

The documented package start command should match the configured Next.js output mode without unsupported-mode warnings.

### Actual result

The process serves requests but emits:

```text
"next start" does not work with "output: standalone" configuration.
Use "node .next/standalone/server.js" instead.
```

Direct `node .next/standalone/server.js` startup passed liveness and root probes.

### HTTP/API evidence

Both modes returned HTTP 200 for `/api/health/live` and `/`; the defect is deployment-command correctness/supportability.

### Console error

The Next.js warning above.

### Likely root cause

`next.config.ts` sets `output: "standalone"`, while `package.json` keeps `start: "next start"`.

### Recommended fix

Align the production start command and deployment documentation with the standalone artifact, including static/public asset handling required by the chosen deployment image.

### Regression risk

Medium deployment risk. Validate Docker and non-Docker production launch paths after correction.

### Fix verification

`npm start` now prepares the standalone artifact and runs `.next/standalone/server.js`. The optimized production smoke test served the root route, a public asset, a generated static asset and health endpoints without the unsupported `next start` warning. Deployment documentation retains separate Docker and non-Docker instructions.

## QA-005 — Successful runtime harnesses leave repository residue

| Field | Evidence |
|---|---|
| Bug ID | `QA-005` |
| Severity | LOW |
| Module | Runtime test cleanup |
| Route | Phase A/B and Phase 4–10 harness teardown |
| Persona | Test runner |
| Environment | Successful sequential harness execution |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Start from a clean checkout.
2. Run the Phase A, Phase B and Phase 3–10 runtime commands sequentially.
3. Run `git status --short` and inspect top-level temporary directories.

### Expected result

Successful tests should leave the worktree clean and remove their temporary PGlite/socket/Next fixtures.

### Actual result

Multiple `.phase*-runtime-*` directories remained untracked, and Next/TypeScript regenerated tracked `next-env.d.ts` or `tsconfig.tsbuildinfo` during some runs. The audit moved generated residue outside the repository and restored the authoritative tracked versions; no product source was changed.

### HTTP/API evidence

Not applicable.

### Console error

No fatal error; the issue is post-success cleanup hygiene.

### Likely root cause

Next child processes/cache files can outlive the harness cleanup window, causing recursive removal to be swallowed by `.catch(() => undefined)` in `finally` blocks.

### Recommended fix

Wait for child process exit, retry bounded removal for known generated paths, and fail the harness when cleanup cannot restore a clean state.

### Regression risk

Low product risk; moderate release-automation risk because guarded commits/publishes can include or detect residue.

### Fix verification

The affected harnesses now capture their starting repository state, retain and terminate isolated child process groups, close dependencies, retry removal, sweep newly generated `.phase*-runtime-*` directories, restore tracked generated files and fail on state drift. Dual Profile A/B/C and Phase 3–10 final runs passed; a delayed post-suite check found no `.phase*-runtime-*` or `.next` residue and no tracked generated-file drift.

## QA-006 — Backup verifier fails with raw ENOENT when evidence is absent

| Field | Evidence |
|---|---|
| Bug ID | `QA-006` |
| Severity | LOW |
| Module | Backup verification tooling |
| Route | `npm run verify:backup` |
| Persona | Operator |
| Environment | Clean checkout without generated backup evidence |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Run `npm run verify:backup` without `backup-manifest.json`.

### Expected result

The verifier should return a concise actionable message stating that `--manifest` is required or how to generate the backup evidence.

### Actual result

The command exits 1 with a raw Node `ENOENT` stack for `backup-manifest.json`.

### HTTP/API evidence

Not applicable.

### Console error

```text
Error: ENOENT: no such file or directory, open '.../backup-manifest.json'
```

### Likely root cause

The default manifest is read without a preflight existence check or usage error wrapper.

### Recommended fix

Add a clear preflight error and document the backup generation/restore workflow next to the script.

### Regression risk

Low product risk; low-to-medium operational usability risk.

### Fix verification

The verifier now preflights manifest/artifact presence, invalid JSON and age configuration, prints a single actionable error by default, and exposes stack details only with `BACKUP_VERIFY_DEBUG=1`. Regression tests verify both missing-evidence failure and a current encrypted fixture with a matching checksum. Operator-supplied production backup evidence remains ENV-005 blocked.

## QA-007 — Phase A report naming is inconsistent with Phase B/C

| Field | Evidence |
|---|---|
| Bug ID | `QA-007` |
| Severity | LOW |
| Module | Release documentation |
| Route | Documentation artifact index |
| Persona | Release reviewer |
| Environment | Authoritative `master` |
| Status | **FIXED — verified 2026-08-08** |

### Steps to reproduce

1. Check for Phase A/B/C report artifacts using the Phase B/C naming convention.

### Expected result

Each protected dual-profile phase should have an unambiguous phase report artifact and consistent index naming.

### Actual result

Phase B and C use `DUAL_PROFILE_PHASE_B_REPORT.md` and `DUAL_PROFILE_PHASE_C_REPORT.md`. Phase A evidence exists as `PHASE_A_DUAL_PROFILE_ARCHITECTURE.md`, but no `DUAL_PROFILE_PHASE_A_REPORT.md` exists.

### HTTP/API evidence

Not applicable.

### Console error

None.

### Likely root cause

The Phase A deliverable used an architecture-document naming convention that changed in later phases.

### Recommended fix

Add a documentation-only alias/report index or update the README/release index to identify the Phase A architecture document as the canonical Phase A report.

### Regression risk

Low. Documentation-only change.

### Fix verification

`DUAL_PROFILE_PHASE_A_REPORT.md` now provides the consistent Phase A report name and points to the protected canonical `PHASE_A_DUAL_PROFILE_ARCHITECTURE.md`; the README index points through the alias without duplicating protected implementation content.

## Environment blockers not counted as product defects

### ENV-001 — Native PostgreSQL unavailable

- Missing: `postgres`, `initdb`, `pg_ctl`, `psql`.
- Impact: real `prisma migrate deploy`, native seed and normal database connectivity gate not passed.
- Required action: install PostgreSQL, create a fresh disposable database, run all 21 migrations and seed.

### ENV-002 — Real Redis unavailable

- Missing: `redis-server`, `redis-cli`.
- Impact: real connection/pub-sub/outage/recovery gate not passed.
- Required action: install Redis and repeat online, stop, degraded-operation, restart and recovery tests.

### ENV-003 — Playwright browsers unavailable

- Missing: Chromium, Firefox, WebKit and mobile Chromium executable.
- Installer failure: the Chromium archive was reported as 0 MiB/truncated on all five download attempts, so Firefox and WebKit installation could not begin.
- Impact: 40 configured cases were discovered across four projects, but no browser assertion executed in this environment.

### ENV-004 — Production environment profile unavailable

- All 17 production-required controls were missing in the ambient environment.
- Ephemeral development audit values passed validation but are not production credentials.

### ENV-005 — Backup evidence unavailable

- No encrypted backup artifact or `backup-manifest.json` was supplied.
- A deterministic fixture passed age/checksum verification; verification of an operator-supplied production artifact remains pending.

## Retest exit criteria

1. **BLOCKED:** Native PostgreSQL `migrate deploy` and seed pass on a fresh database.
2. **BLOCKED:** Real Redis online/outage/restoration scenarios pass.
3. **COMPLETE:** `QA-001` returns structured 503 responses for dependency outages.
4. **BLOCKED:** All four Playwright projects execute with installed real browsers.
5. **COMPLETE IN REPOSITORY:** Authenticated browser coverage exists for release-critical workflows; execution is covered by item 4.
6. **COMPLETE:** Production startup uses the supported standalone command without warning.
7. **COMPLETE:** Runtime harnesses leave the worktree at its starting state.
8. **PARTIAL:** Backup fixture verification passes; an operator-supplied production artifact remains blocked.
9. **COMPLETE IN REPOSITORY:** Requested negative review and proposal edit/withdraw scenarios are encoded in the authenticated suite; execution is covered by item 4.
10. Final production release approval remains conditional on the five environment gates above.
