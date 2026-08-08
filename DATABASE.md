# Database — Sprint 29 Chat Domain

## Dual-Profile Phase B

Apply `20260801150000_dual_profile_marketplace_phase_b` after Phase A. It adds public presentation and visibility fields to canonical profiles, `ProfileVisibility`, `ProfileContentType`, unique search-ready usernames, education, certification, social links and saved providers. Portfolio and experience reuse existing models with version, visibility and soft deletion. Five legacy indexes are replaced with visibility-aware equivalents; no table, column or type is dropped.

The complete `prisma/schema.prisma` remains authoritative. Shared deployments use `prisma migrate deploy`, never `prisma db push`. See `DUAL_PROFILE_PHASE_B_REPORT.md` for the environment-specific PGlite schema-engine caveat and successful 20-migration fresh replay.

## Phase A dual-profile foundation

The complete `prisma/schema.prisma` now includes `PersonalIdentity`, `OnboardingProgress`, `AccountPersona`, `ClientProfile` and `PersonaEvent`, an optional `FreelancerProfile.personaId`, and `AuthSession.activePersonaId`. Apply `prisma/migrations/20260801090000_dual_profile_marketplace_phase_a/migration.sql` after the 18 Phase 0-10 migrations. The migration is additive and backfills existing accounts, memberships and provider profiles without rebinding live sessions or deleting released data.

Do not use `prisma db push` in shared environments. Use `prisma migrate deploy`, then run `npm run test:phase-a:runtime` against a disposable integration environment for the full onboarding/session/persona contract.

`prisma/schema.prisma` is the complete application schema through Sprint 29. It includes all pre-existing organization, authentication, authorization, project workspace, realtime, presence, and notification models plus the chat domain.

## Chat entities

- `ChatChannel`: tenant/project scope, type, visibility, sequence counter, lifecycle, metadata, and retention policy.
- `ChatChannelMember`: role, notification level, mute window, active lifecycle, and monotonic read watermark.
- `ChatMessage`: channel-local sequence, thread parent, client idempotency key, format, version, soft-delete state, and reply count.
- `ChatMessageRevision`: immutable previous body/version for governed edits and deletion.
- `ChatMention`: validated message-to-user mentions.
- `ChatReaction`: unique user/message/emoji reactions.

## Integrity and scale

- `ChatChannel(organizationId, slug)` and nullable `directKey` enforce channel identity.
- `ChatMessage(channelId, sequence)` creates deterministic ordering.
- `ChatMessage(channelId, clientMessageId)` enforces retry idempotency.
- Channel/user membership and message/user mention/reaction composites prevent duplicates.
- Access-path indexes cover tenant channel lists, project channel lists, member inboxes, message timelines, threads, author history, mentions, and reactions.
- Foreign-key delete behavior preserves authorship while cascading tenant/channel content when its parent organization/project/channel is intentionally removed.

## Migration

Apply the committed migration:

```powershell
npx.cmd prisma migrate deploy
```

Migration file: `prisma/migrations/20260717023000_enterprise_realtime_chat_collaboration/migration.sql`.

The migration also inserts the four additive chat permissions and grants them to existing default roles. It does not alter custom role grants.

## Retention

Retention is optional per channel. The scheduled maintenance service deletes expired replies first and deletes an expired thread root only when it has no replies still inside the retention window. This prevents a newly active thread from losing its root prematurely.

## Coordinated release migration

`prisma/migrations/20260717050000_complete_product_foundation/migration.sql` is additive and creates the marketplace, contracting, delivery, files, AI, search, finance, subscriptions, administration, compliance, analytics, export, job, dead-letter, webhook, and idempotency tables plus indexes and foreign keys. It also inserts 18 permissions and grants them only to existing named default roles; custom roles remain unchanged.

Apply committed migrations in order with `npx.cmd prisma migrate deploy`. Back up and validate restore first. Do not use `db push` in shared or production environments. Run `npx.cmd prisma db seed` only for idempotent reference skills, feature flags, and the zero-priced custom enterprise plan; the seed does not create users, tenants, contracts, money, or demo history.

All monetary values are integer minor units (`BigInt`); API serialization emits strings. Tenant-owned high-volume tables include composite organization/time or organization/status indexes. Realtime mutation events use the existing transactional `RealtimeEvent` outbox.
