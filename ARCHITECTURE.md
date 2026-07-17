# Architecture — Sprint 29

## Write path

1. The route verifies the existing authenticated server-side session and CSRF token.
2. RBAC, organization, channel membership, and project policy checks resolve access.
3. Zod validates and bounds the input; Redis enforces mutation rate limits.
4. Prisma commits domain state, audit evidence, notifications, and outbox events atomically.
5. The existing realtime publisher sends pending events to the tenant-authorized Redis topic.
6. Authenticated SSE clients receive ordered events and reconcile using channel sequence numbers.

Typing is the deliberate exception: it is ephemeral, rate-limited, published directly to Redis, and expires after eight seconds.

## Consistency decisions

- PostgreSQL is the durable source of truth; Redis is transport and rate-limit infrastructure.
- Per-channel counters provide deterministic order without trusting wall-clock timestamps.
- UUID client message IDs provide safe retries.
- Expected message versions prevent lost edits.
- Read watermarks scale linearly with channel membership instead of creating one receipt row per message/user.
- Direct-channel canonical keys eliminate duplicate one-to-one conversations inside an organization.

## Service boundaries

- `ChatChannelService`: discovery, creation, lifecycle, retention configuration, and member governance.
- `ChatMessageService`: timelines, threads, create/edit/delete, mentions, notification fan-out, reactions, read state, and typing.
- `ChatRetentionService`: bounded, auditable scheduled erasure.
- `requireChatChannelAccess`: shared tenant/RBAC/channel/project policy enforcement.
- `enforceChatRateLimit`: Redis atomic fixed-window limits.

## Coordinated product boundaries

- Routes authenticate, enforce CSRF for browser writes, resolve one granular permission, validate with Zod, and delegate to a tenant-aware service.
- PostgreSQL remains authoritative. Marketplace, contract, delivery, file, AI, finance, search, analytics, and administrative state use explicit organization foreign keys and access-path indexes.
- `MarketplaceService`, `ContractService`, `DeliveryService`, `EnterpriseFileService`, `AiRunService`, `FinanceService`, and `PlatformQueryService` own transaction boundaries and cross-model invariants.
- Provider adapters isolate storage signing, AI completion, and payment execution from domain state. They use opaque references and environment credentials, time out requests, fail closed, and preserve provider idempotency.
- Durable product mutations create existing `RealtimeEvent` outbox entries on organization or project topics. The inherited Redis publisher and authorized SSE stream remain the transport.
- `BackgroundJob` is the durable queue contract. Workers claim bounded jobs, record attempts/errors, reschedule transient failures, and can move exhausted work to dead-letter state.
- Search is tenant-scoped PostgreSQL indexing by default; `SearchDocument` is the abstraction point for a managed search backend. Analytics uses append-only events plus daily aggregates.

The `/platform` console is a thin localized consumer of the same APIs. It contains no privileged server logic.
