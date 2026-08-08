# Dual-Profile Marketplace Architecture — Phase C

## Outcome

Phase C completes the integration layer intentionally deferred by Phase B. Marketplace, contract, review, reputation, search, profile-action and governed-AI workflows now consume the canonical Phase A persona and Phase B public-profile records instead of inventing alternate identity systems.

The authoritative parent is `45fd082b199602b01e93e8279eb5c5e1cc20769a`. Phase 0–10, Sprint 1, Phase A and Phase B remain protected. The Phase C database change is additive and legacy contract/review records remain readable.

## Marketplace persona behavior

The authenticated session remains the only source of the active persona. Browser request bodies cannot choose an acting persona.

- Client and organization hiring contexts can create listings, review and decide proposals, save providers, follow public profiles, send listing-bound invitations, compare public providers and award through the existing atomic award service.
- Freelancer context can browse listings, receive and decide invitations, create/update/submit/withdraw proposals, track status and open awarded contracts.
- Organization context continues to compose member RBAC with its session-bound organization persona. Individual freelancer identity is never inferred from an organization label.
- Marketplace pages and global navigation are persona-specific. Client-only primary controls are absent in freelancer mode and provider-only primary controls are absent in client mode. Services independently enforce the same boundary.

`SavedProvider`, `ProfileFollow` and `MarketplaceInvitation` now represent separate concepts. The compatibility follow endpoint writes only `ProfileFollow`; it no longer aliases “follow” to “save.” Invitations are listing-bound, idempotent per target, version guarded on response and auditable.

Provider comparison accepts two to four eligible public freelancer profiles. It shows real public headline, skills, verification, availability, rate, services, experience, languages, portfolio count and reputation data. It creates no winner score or synthetic recommendation.

## Contract persona model

New marketplace contracts persist immutable side evidence where applicable:

- `clientAccountId`, `clientProfileId`, `clientPersonaId`, `clientPersonaType`
- `providerUserId`/`providerOrganizationId`, `providerProfileId`, `providerPersonaId`, `providerPersonaType`
- existing listing, proposal, project and organization references

Proposal awards derive this evidence from the active client session and the proposal’s stored provider persona. Direct governed contract creation also derives the sides server-side and rejects a missing provider identity or the same account on both sides.

Contract reads and lists resolve the active side from stored evidence. Acceptance requires the recorded account, persona, tenant/membership, side, current version and terms hash. `ContractAcceptance` records the active persona and membership in addition to the existing immutable account, side, terms hash, method, network and time evidence. The request cannot spoof these fields.

Legacy contracts have nullable Phase C persona/profile columns. Only records with both persona types absent use the pre-Phase-C safe account/organization derivation. No profile is fabricated and no legacy acceptance row is rewritten.

## Reviews and reputation

The existing `Review` domain remains authoritative. A review is allowed only after final governed contract completion and only from the authenticated contract side. Review directions are independent and immutable: the unique `directionKey` is `contractId:CLIENT` or `contractId:PROVIDER`.

Client-to-provider reviews require overall, quality, communication, delivery, expertise and professionalism ratings. Provider-to-client reviews require overall, hiring clarity, communication, payment reliability and professional conduct ratings. Every dimension is bounded from one to five at validation and database levels.

Review evidence includes contract, reviewer account, reviewer persona, subject persona, subject client/freelancer profile, tenant context, direction, dimensions, feedback, timestamps and moderation status. There is no review update endpoint. Duplicate direction, self-review, incomplete engagement, wrong persona and cross-tenant attempts are rejected. Existing abuse reporting and moderation remain available for published profile content.

`ReputationService` is deterministic and bounded. It reads only persisted `PUBLISHED` reviews and eligible contract/milestone records. Provider and client dimensions remain separate. Completion, on-time, repeat-client/repeat-hire and satisfaction metrics appear only when legitimately derivable; an explicit `NOT_ENOUGH_DATA` state is returned otherwise. Private earnings are never read or exposed.

## Search root cause and consistency model

The release-blocking false “No matching records” response had two interacting causes:

1. Project creation and mutation did not produce a `SearchDocument` or enqueue a search-entity job.
2. Search correctness depended on a reindex/incremental worker and PostgreSQL full-text `websearch_to_tsquery`, which does not provide the required case-insensitive arbitrary substring behavior. A fresh account could therefore have a visible project with no indexed document.

Phase C uses an authoritative live read-through consistency model. Every search request performs permission-filtered, case-insensitive `contains` queries against the canonical tables for projects, tasks, members, clean accessible files, accessible contracts, the active organization, visible listings, public client profiles, public freelancer profiles and public organizations. The durable search index and federation remain supplemental for non-live sources, ranking, cursor continuation and operational reindexing.

Project create/update/delete additionally synchronizes its search document immediately after the transaction and invalidates the tenant cache. A failed accelerator synchronization is logged but cannot cause a false no-results state because the live read remains authoritative. Cancelled/deleted internal records and non-public, inactive, suspended or archived profiles are excluded at the source query. The existing Ctrl/Cmd+K shell, Escape behavior, keyboard result navigation, highlights and cursor continuation remain intact.

## Stale-state investigation

The generic message came from the shared browser API client, which replaced every server `CONFLICT` response with one localized generic string. It hid precise server causes such as stale versions, invalid state transitions and duplicate immutable actions. The optimistic guards themselves were correct and were not removed.

The client now preserves a server-supplied conflict message. Contract/review forms keep unsaved input, disable duplicate submission while pending and show a contextual “newer data exists” recovery instruction for HTTP 409. Services continue to require versions, current states, unique direction/idempotency keys and deliberate retries. A genuine conflict remains expected behavior; no silent overwrite occurs.

## Governed AI assistance

Profile assistance delegates to the existing Phase 5 `AiGovernanceService`, so tenant enablement, allowed use cases/providers/models, token/cost budgets, prompt versions, optional human approval, durable jobs, audit and provider failure behavior remain authoritative.

Freelancer use cases cover headline, summary, completeness, skill gaps, portfolio, capability, opportunity match and rate positioning. Client use cases cover hiring profile, brief, skill suggestions, comparison explanation and scope risk. Inputs contain only the selected persona’s required profile/project/listing/public-provider fields; private earnings, contact data and credentials are omitted.

AI is optional. Policy, budget, configuration or provider unavailability returns a graceful unavailable result and never blocks normal profile editing or marketplace use. Suggestions are visibly labeled, never written to a profile by the AI route and require a separate human-reviewed profile mutation to persist.

## Database and migration

Migration `20260802100000_dual_profile_marketplace_phase_c` adds:

- `MarketplaceInvitationStatus`
- `ProfileFollow` with exactly-one-target validation
- `MarketplaceInvitation` with exactly-one-provider-target validation
- listing/proposal acting-persona references
- nullable legacy-compatible contract and acceptance persona/profile evidence
- nullable review direction, subject and dimension evidence
- unique and access-path indexes for follows, invitations, contract sides and reputation reads
- database rating-range checks

The migration contains no `DROP TABLE`, `DROP COLUMN` or `DROP TYPE`, performs no fake association/reputation backfill and does not alter seed data. The existing reference seed remains idempotent and contains no fake reviews or ratings.

## Security boundaries

- Session-bound persona plus RBAC and active membership are checked server-side.
- Every browser mutation uses the existing CSRF boundary and Zod validation.
- Ownership and tenant predicates protect listings, proposals, contracts, invitations and reviews against IDOR.
- Award and acceptance identity evidence is derived from stored sessions/records, never headers or bodies.
- Version guards, unique keys and serializable transactions preserve concurrency and idempotency.
- Public search/comparison/reputation use visibility allowlists and bounded selects; private fields and earnings are absent.
- Review dimension constraints and immutable direction keys prevent repeated rating manipulation.

## Verification

Phase C adds `tests/phase-c-dual-profile-marketplace.test.mjs` and `scripts/verify-phase-c-runtime.mjs`. The static contracts cover the additive schema, separate profile actions, persona contracts, directional reviews, deterministic reputation, authoritative search, persona UI, optional governed AI and stale-conflict recovery. The runtime verifier applies all 21 migrations to a fresh PostgreSQL-compatible database and exercises the new constraints and compatibility columns.

The Phase A and Phase B live runtime verifiers now execute on the Phase C schema. The Phase B verifier additionally covers immediate project search create/case/partial/update/delete and cross-tenant exclusion, save/follow/invite, invitation response, proposal/shortlist/award, immutable contract persona evidence, wrong-side denial, both acceptances, completed engagement reviews, duplicate-review denial and public reputation recalculation.

The full Phase 2–10 and Sprint 1 runtime regression set passes on all 21 migrations, including commercial concurrency and settlement, realtime collaboration, files/search/analytics, AI governance, contract execution, subscriptions, enterprise identity, CRM/talent/knowledge integrations and multi-region production controls. `npm run verify:release` passes Prisma validation/generation, ordered migration checks, 1,674-message English/Arabic locale parity, 221-route security checks, the secret scan, all 90 static tests, TypeScript, ESLint and an optimized 309-route Next.js production build. The production dependency audit reports zero vulnerabilities. Playwright discovers all 36 configured Chromium, Firefox, WebKit and mobile-Chrome accessibility/responsive checks; execution is deferred because the container has no browser binaries.

## Known limitations

- Native PostgreSQL binaries are not installed in the verification container (`postgres`, `initdb`, `pg_ctl` and `psql` are unavailable). A normal `prisma migrate deploy` invocation was attempted and reached the Prisma schema engine, but no PostgreSQL server was available. Production must still run it against the deployment database; the local fallback successfully replayed all 21 chronological SQL migrations through PGlite.
- AI output is asynchronous when the existing worker is configured; the profile page links to the governed AI workspace for approval and completion state.
- Organization-provider proposals remain limited to capabilities already supported by the existing organization/RBAC and provider-profile domain.
- No browser binary is bundled in the container; API/runtime and production-render verification do not replace a human visual pass on deployed desktop/tablet/mobile targets.
