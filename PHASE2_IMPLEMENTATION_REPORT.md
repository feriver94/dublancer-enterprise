# Phase 2 Implementation Report

## Executive summary

Phase 2 implements only the governed marketplace-to-settlement lifecycle approved in `FUNCTIONAL_AUDIT_REPORT.md`. It preserves the Phase 0 security boundary and Phase 1 workspace integration and does not implement CRM, AI expansion, search indexing, analytics, chat redesign, files expansion, identity/SSO, full localization remediation, or any other later-phase finding.

The implementation closes the critical commercial consistency gaps: one tenant-scoped atomic award creates one contract and rejects all competitors; contract activation requires immutable acceptance evidence from both counterparties; milestone submissions and decisions use optimistic concurrency and immutable history; issued invoices can be charged idempotently; signed provider webhooks settle transactions, invoices, schedules, milestones, refunds, and reconciliation records atomically.

## Audit findings implemented

| Finding | Result | Implementation evidence |
| --- | --- | --- |
| FA-001 — non-atomic marketplace award | Implemented | Serializable `awardProposal` command, listing/proposal version guards, tenant-scoped lookup, durable idempotency record, unique contract/listing relationship, winner acceptance, competitor rejection, audit/realtime events, direct proposal-backed contract creation blocked. |
| FA-002 — unreachable invoice charging | Implemented | Validated Draft → Issued → Overdue/Paid lifecycle, issue/overdue/void endpoint, payable-balance reservation, invoice version guards, idempotent charges, audit/realtime events. |
| FA-003 — non-settling payment webhooks | Implemented | Strict allowlisted webhook contract, HMAC verification, provider/event and provider/reference correlation, replay/body mismatch protection, charge/refund settlement, reconciliation updates, failure states, audit evidence. |
| FA-006 — marketplace owner proposal UI | Implemented for approved scope | Owner review UI supports shortlist, reject and atomic award; provider UI supports live tracking, withdrawal, contract navigation, refresh, error and pending states. |
| FA-007 — contract execution | Implemented for approved Phase 2 scope | Two-party acceptance evidence and terms hash, signature-gated activation, role-aware milestone creation/submission/decision, immutable decision history, and finance-linked release. Audit items outside the approved prompt—amendment decisions and reviews—remain pending. |
| FA-008 — finance product UI | Implemented for approved scope | Protected live invoice/payment interface supports draft creation, issue, overdue, void, charge, provider state, reconciliation-facing status and bounded refund initiation with AED formatting. Subscription administration remains FA-023. |
| FA-017 — runtime commercial evidence | Partially advanced | Added a committed deterministic three-tenant runtime harness and six Phase 2 release tests. Broader browser/runtime coverage for later modules remains pending. |

## Marketplace commercial lifecycle

- Proposal decisions enforce actor-specific permissions and legal source states.
- Owner shortlist/reject and provider withdrawal use optimistic proposal versions.
- Award uses a serializable transaction and a 30-day scoped idempotency record.
- Listing must be `PUBLISHED`; proposal must be `SUBMITTED` or `SHORTLISTED`.
- Award updates the listing to `AWARDED`, records `awardedAt`, accepts exactly one proposal, creates one `PENDING_SIGNATURES` contract, and rejects competing active proposals.
- A unique `Contract.listingId` constraint and existing unique proposal relation provide database-level duplicate protection.
- Stale or concurrent requests return controlled conflicts.
- Every successful decision/award writes audit and realtime evidence.

## Contract execution

- Contract terms use stable serialization and SHA-256 evidence.
- `ContractAcceptance` records party, actor, tenant, method, IP, user agent, terms hash and acceptance time.
- One immutable acceptance per contract party is enforced by a unique constraint.
- A `PENDING_SIGNATURES` contract becomes `ACTIVE` only after both eligible counterparties accept the same terms.
- Client-only milestone creation and provider-only submission are enforced server-side.
- One active submission per milestone and monotonically increasing revisions are database constrained.
- Client decisions use milestone and submission version guards.
- `WorkSubmissionDecision` is immutable and unique per submission.
- Approved milestones become invoice-eligible; paid invoices release their payment schedule and milestone.

## Finance lifecycle

- Invoice transitions validate source state, due date, settled charges and optimistic version.
- Contract-linked invoices automatically bind their bill-to tenant to the provider organization.
- Accepted milestone invoices must exactly match milestone amount and currency.
- Charge initiation calculates unreserved outstanding balance and reserves it in a serializable transaction.
- Payment/refund provider calls are configuration-backed; a missing provider fails closed with `SERVICE_UNAVAILABLE`.
- Financial transactions and refunds use tenant-scoped idempotency keys.
- Signed webhook events validate provider, event identifier, body hash, provider reference, tenant, amount and currency.
- Successful charge events update transaction, invoice, schedule, milestone and reconciliation state atomically.
- Successful refund events update the refund transaction, refund record and reconciliation state atomically.
- Repeated identical events are idempotent; a reused event identifier with different content is rejected.
- Failed provider events record stable failure codes/messages without fabricating settlement.

## Prisma and migration changes

Migration: `20260719090000_governed_commercial_settlement`

New enums:

- `ContractAcceptanceParty`
- `ContractAcceptanceMethod`
- `SubmissionDecisionType`
- `WebhookProcessingStatus`

New models:

- `ContractAcceptance`
- `WorkSubmissionDecision`

Strengthened models:

- `MarketplaceListing`: award timestamp and optimistic version.
- `Proposal`: immutable provider-organization binding, decision actor/time and optimistic version.
- `Contract`: unique listing relationship and optimistic version.
- `ContractMilestone` / `WorkSubmission`: optimistic versions, revisions and active-submission constraint.
- `Invoice`: void timestamp and optimistic version.
- `FinancialTransaction`: failure/processing evidence, version and unique provider correlation.
- `Refund`: tenant binding, refund transaction, idempotency and version.
- `WebhookReceipt`: event type/reference, correlated transaction/refund and processing status.
- `ReconciliationRecord`: event count and last reconciliation timestamp.
- `PaymentSchedule`: one invoice schedule per contract milestone.

Database constraints include unique listing award, unique acceptance party, unique submission revision, partial unique active milestone submission, unique milestone payment schedule, unique immutable decision, unique provider reference, tenant-scoped refund idempotency and positive refund amount.

Seed data did not require modification because all Phase 2 permissions already exist in the established permission catalog/default roles. The unchanged seed was executed successfully after all 11 migrations.

## APIs

New endpoints:

- `POST /api/marketplace/proposals/[proposalId]/award`
- `POST /api/contracts/[contractId]/acceptances`
- `GET /api/contracts/[contractId]/milestones/[milestoneId]`
- `GET|POST|PATCH /api/contracts/[contractId]/milestones/[milestoneId]/submissions`
- `GET|PATCH /api/finance/invoices/[invoiceId]`
- `GET|POST /api/finance/refunds`

Reused or extended endpoints:

- `GET|POST /api/marketplace/listings`
- `GET /api/marketplace/listings/[listingId]`
- `GET|POST /api/marketplace/proposals`
- `PATCH /api/marketplace/proposals/[proposalId]`
- `GET /api/contracts`
- `GET|PATCH /api/contracts/[contractId]`
- `POST /api/contracts/[contractId]/milestones`
- `GET|POST /api/finance/invoices`
- `POST /api/finance/charges`
- `POST /api/webhooks/payments/[providerKey]`

Every cookie-authenticated mutation has the existing CSRF guard. The payment webhook remains an explicit non-cookie exemption and authenticates through HMAC verification. Existing session, active-membership tenant context and permission resolution are reused; no parallel security system was introduced.

## Product interfaces

- `MarketplaceClient`: live provider proposal tracking and withdrawal; listing-owner review integration.
- `ProposalReviewClient`: proposal evidence, shortlist/reject, award confirmation and governed contract creation.
- `ContractDetailClient`: party-aware signatures, lifecycle, milestones, submissions and immutable client decisions.
- `PaymentsClient`: live invoice ledger, issue/overdue/void, charge and refund workflows, AED formatting, provider-boundary disclosure.
- `/payments`: replaced the generic operations console with the protected Phase 2 finance client.

## Files changed

### Modified

- `package.json`
- `prisma/schema.prisma`
- `scripts/verify-migrations.mjs`
- `src/app/api/contracts/[contractId]/route.ts`
- `src/app/api/marketplace/proposals/[proposalId]/route.ts`
- `src/app/api/webhooks/payments/[providerKey]/route.ts`
- `src/app/payments/page.tsx`
- `src/components/contracts/ContractDetailClient.tsx`
- `src/components/contracts/ContractsClient.tsx`
- `src/components/marketplace/MarketplaceClient.tsx`
- `src/lib/providers/integrations.ts`
- `src/lib/services/commercial-platform.service.ts`
- `src/lib/services/product-platform.service.ts`
- `src/lib/validation/commercial.ts`
- `src/lib/validation/product.ts`

### Added

- `prisma/migrations/20260719090000_governed_commercial_settlement/migration.sql`
- `scripts/verify-commercial-flow.mjs`
- `src/app/api/contracts/[contractId]/acceptances/route.ts`
- `src/app/api/contracts/[contractId]/milestones/[milestoneId]/route.ts`
- `src/app/api/contracts/[contractId]/milestones/[milestoneId]/submissions/route.ts`
- `src/app/api/finance/invoices/[invoiceId]/route.ts`
- `src/app/api/finance/refunds/route.ts`
- `src/app/api/marketplace/proposals/[proposalId]/award/route.ts`
- `src/components/marketplace/ProposalReviewClient.tsx`
- `src/components/payments/PaymentsClient.tsx`
- `tests/phase2-commercial-lifecycle.test.mjs`
- `PHASE2_IMPLEMENTATION_REPORT.md`

## Test coverage added

- Atomic award source-state, tenant, version and idempotency invariants.
- Concurrent award: exactly one of two competing requests succeeds.
- Winner, loser, listing and single-contract persistence.
- Two-party signature evidence and signature-gated activation.
- Concurrent milestone submission: exactly one active submission succeeds.
- Immutable client decision history.
- Invoice issue and payable charge lifecycle.
- Duplicate milestone-invoice rejection and concurrent charge reservation: exactly one reservation succeeds.
- Signed charge settlement, duplicate delivery and event-body replay rejection.
- Refund provider flow, concurrent refundable-balance reservation and signed refund settlement.
- Reconciliation idempotency and expected/actual balance.
- Cross-tenant contract/invoice isolation and permission denials.
- UI-to-API wiring and migration constraint checks.

## Actual verification evidence

All results below were produced from this working tree. The runtime suite used a fresh isolated PostgreSQL-compatible PGlite test instance and a local deterministic payment-provider stub; no live payment result was simulated in product code.

| Command/gate | Actual result |
| --- | --- |
| `npm ci` | Passed — 504 packages installed from lockfile in 1 minute. |
| `npx prisma validate` | Passed — schema valid. |
| `npx prisma generate` | Passed — Prisma Client 7.8.0 generated. |
| `npx prisma migrate deploy` | Passed — all 11 chronological migrations applied to a fresh database. |
| `npm run seed` | Passed — `Dublancer reference data seeded.` |
| `npm test` | Passed — 19 tests, 0 failed. |
| `npm run test:commercial` | Passed — 3 tenants; 1/2 concurrent awards; 2 acceptances; 1/2 concurrent submissions; 1 immutable decision; duplicate milestone invoice rejected; 1/2 concurrent charges; 1/2 bounded concurrent refunds; invoice `PAID`; refund `COMPLETED`; 2 matched reconciliation events; tenant, permission and replay checks verified. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with blocking errors enabled. |
| `npm run verify:migrations` | Passed — 11 ordered migrations and additive commercial migration. |
| `npm run verify:locales` | Passed — 165 messages per locale. No full localization remediation was performed because FA-018 is outside Phase 2. |
| `npm run verify:security` | Passed — 131 API route files, 9 explicit non-cookie exemptions. |
| `npm run verify:secrets` | Passed — 1,028 text source files scanned. |
| `npm audit --audit-level=high` | Passed at the configured threshold — 0 high/critical; 5 known moderate transitive findings. Automated force fixes propose incompatible downgrades and were not applied. |
| `npm run build` | Passed — Next.js 16.2.9 production compilation, TypeScript, and all 265 routes/static-page entries generated. |
| `npm run verify:release` | Passed — Prisma, migration, locale, security, secret, test, TypeScript, ESLint and production build gates completed as one command. |

The container lacks the resident-memory telemetry syscall expected by Next.js. A temporary external `NODE_OPTIONS` shim was used only to return zero for that unavailable telemetry call during build verification. The shim is outside the repository and is not part of this implementation.

## Backward compatibility

- Existing endpoint paths and response envelopes are preserved.
- Existing proposal decision API remains compatible but now requires the optimistic `expectedVersion` for unsafe decisions.
- Proposal-backed contracts must use the award endpoint; this controlled breaking restriction prevents the audited invalid direct-creation path.
- Contracts awaiting signatures can no longer transition directly to `ACTIVE`; both acceptance records are required.
- Existing legacy refund rows are backfilled with tenant/idempotency evidence by the migration.
- No unrelated modules, permission catalogs or seed roles were changed.

## Remaining audit findings

Not implemented because they are outside the approved Phase 2 scope:

- FA-004 and FA-005: remaining protected route groups and static control families.
- FA-007 remainder: amendment decision and review workflows beyond the approved contract acceptance/milestone scope.
- FA-009 and FA-010: chat product redesign and Redis outage resilience.
- FA-011 and FA-022: governed files/attachment consolidation and version lifecycle.
- FA-012: AI workspace expansion.
- FA-013 and FA-026: search indexing, cache invalidation and scalable provider strategy.
- FA-014: analytics ingestion and aggregation.
- FA-015, FA-016 and FA-027: administration, general workers and observability.
- FA-017 remainder: browser/runtime suites for non-commercial modules.
- FA-018: full `en-AE`/`ar-AE` localization and RTL remediation.
- FA-019: complete notification inbox consolidation.
- FA-020 and FA-021: advanced delivery and workspace member UX.
- FA-023: provider-governed subscription administration.
- FA-024 and FA-025: outbound account email operations and adaptive authentication abuse controls.
- FA-028 through FA-031: remaining schema/runtime coverage, enterprise identity, CRM/talent/integration/knowledge modules and frontend consolidation.
- FA-032: vendor-compatible framework/tooling upgrade for five moderate transitive advisories.

No Phase 3 or unrelated finding was started.
