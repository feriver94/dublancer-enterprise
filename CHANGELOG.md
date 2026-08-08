# Changelog

## Phase B — Dual-Profile Public Profiles and Dashboards — 2026-08-08

- Added privacy-governed client and freelancer/provider public profiles plus an organization public-profile foundation.
- Added database-backed persona dashboards, four-identity settings and portfolio, case study, publication, research, experience, education, certification and social-link management.
- Added dynamic completion, search-ready usernames, optimistic conflicts, soft deletion, visibility lifecycle, saved providers and strict public serializers.
- Added migration `20260801150000_dual_profile_marketplace_phase_b`, bilingual responsive dark/light/RTL UX, Phase B static/runtime verification and documentation.
- Preserved Phase 0–10, Sprint 1 and Phase A; deferred reviews/reputation, marketplace redesign, contract-persona integration, search expansion, AI profile assistance and matching to Phase C.

## Phase A — Dual-Profile Marketplace Architecture — 2026-08-01

- Added one-account client, freelancer/provider and organization persona architecture with personal identity and guided-onboarding state.
- Added session/JWT persona binding, audited persona activation and switching, active-membership enforcement, and persona capability checks composed with existing RBAC.
- Added bilingual `/onboarding` and `/account/personas` experiences plus a global authenticated-navbar persona switcher.
- Added additive migration `20260801090000_dual_profile_marketplace_phase_a`, compatibility backfill, static contracts, a fresh-database runtime verifier and Phase A architecture documentation.
- Preserved Phase 0-10 and Sprint 1 behavior; deferred dashboards, public profiles, reviews, contract persona workflows, AI profile features, marketplace redesign and search expansion.

## Final Enterprise Release — 2026-07-17

- Integrated the complete commercial platform and all inherited capabilities into one final source release.
- Added durable work graphs, versioned orchestration, human approvals, explainable matching, platform operations, moderation/compliance workflows and enterprise rate limiting.
- Completed provider boundaries for storage/scanning, AI, payments and outbound notifications with fail-closed behavior.
- Added live authenticated interfaces across all primary modules, secure registration/recovery flows and 165-key `en-AE` / `ar-AE` parity with RTL.
- Added the final additive migration, reference seed, deterministic migration/secret/security checks, final product status, actual verification record and final installer/verifier.

## Coordinated Enterprise Product Release — 2026-07-17

### Added

- Complete marketplace, profiles, proposals, contracting, delivery governance, enterprise files, governed AI, finance, universal search, analytics, administration, support, compliance, and background-job Prisma domains.
- Additive `20260717050000_complete_product_foundation` migration with constraints, indexes, foreign keys, and 18 additive RBAC permissions.
- Tenant-safe marketplace, contracts, delivery, files, AI, invoices/payments, search, analytics, security event, support, and export services/APIs.
- Provider-neutral storage signing, OpenAI-compatible AI, and payment orchestration adapters; signed payment webhook verification and idempotent financial operations.
- Durable AI approval/worker flow, token budget checks, usage accounting, audit logs, and dead-letter-ready jobs.
- Bilingual product operations console, message-key parity checks, dynamic HTML language/direction, RTL layout, UAE defaults, reference-data seed, Node tests, security checks, and final PowerShell verification.

### Security

- Removed browser-controlled tenant/user header trust from inherited API routes; tenant context now comes from the signed session and active server-side session record.
- Added missing CSRF enforcement to inherited project, account, organization, role, invitation, membership, and locale mutations.
- Downloads remain blocked until malware scan state is `CLEAN`; provider calls fail closed; payment webhooks use constant-time HMAC verification.

### Preserved

- Sprint 28 notifications, authentication cookies, organizations, RBAC, project workspace, Redis realtime/presence, event outbox, and all Sprint 29 enterprise chat behavior remain compatible.

## Sprint 29 — Enterprise Realtime Chat and Collaboration

### Added

- Complete Prisma chat domain: `ChatChannel`, `ChatChannelMember`, `ChatMessage`, `ChatMessageRevision`, `ChatMention`, and `ChatReaction`.
- Chat enums for channel type/visibility, membership role, notification level, and message format.
- Committed additive migration `20260717023000_enterprise_realtime_chat_collaboration` with indexes, constraints, foreign keys, and default-role RBAC grants.
- Tenant-aware channel discovery, direct-channel deduplication, project channel eligibility, archives, retention policies, membership governance, mute settings, and ownership invariants.
- Message timeline and thread APIs with forward/backward sequence pagination, idempotent create, optimistic edit versioning, history, soft delete, mentions, reactions, and read watermarks.
- Redis rate limits and ephemeral typing events.
- Durable chat events on the Sprint 28 realtime outbox and authenticated SSE subscriptions for channel topics.
- Sprint 28 notification integration for message and mention delivery, preference resolution, deduplication, and user-topic realtime events.
- Audited retention purge service and constant-time secret-protected maintenance API.
- Browser realtime/mutation helpers and PowerShell verification automation.
- `next-intl`, which was referenced by the inherited application but absent from Sprint 28 v2 dependencies.

### Security

- Every browser mutation requires the existing session plus CSRF token.
- Channel access is tenant-scoped and combines organization RBAC, channel membership, and project access.
- Moderation, owner appointment, retention changes, and member lifecycle operations enforce least privilege.
- Message bodies and secrets are excluded from audit metadata; delivery archives exclude local secret files.
- Input size, control-character, metadata-size, participant-count, and pagination bounds are validated with Zod.

### Compatibility fixes inherited from Sprint 28 v2

- Reconciled notification generic route/service/validation exports.
- Corrected notification internal response status ordering.
- Restored stale notification and integration barrel exports.
- Added the shared `glass` card variant already used across the UI.
- Corrected organization settings `defaultLocale` mapping and Prisma JSON input typing.
- Replaced missing CRM component references with existing components.
- Removed the inherited notification effect lint blocker.

### Preserved

- Existing authentication/session cookies, CSRF behavior, organizations, RBAC, project workspace models and APIs, Redis realtime publisher, presence services, and Sprint 28 notifications remain backward compatible.
