# Sprint 29 Security Controls

## Authorization boundaries

- Authenticated tenant context is derived only from the signed access token and active server-side session.
- Organization RBAC permissions gate chat read, channel create, message create, and moderation actions.
- Private channels require active channel membership.
- Project channels additionally require project membership/ownership; participants and mentions cannot exceed that boundary.
- Organization-visible channels require an active organization membership.
- Direct channels are organization-scoped, deduplicated, private, and have immutable membership.
- Channel owner invariants prevent removal or demotion of the final owner.

## Request and content security

- Existing same-site CSRF double-submit checks protect every browser mutation.
- Zod schemas bound text, metadata, participant arrays, pagination, retention, and message sizes.
- Unsupported control characters are rejected. Message formats are plain text and Markdown only; raw HTML rendering must stay disabled in consumers.
- Message create retries are idempotent with a channel-scoped UUID.
- Edits use optimistic version checks to prevent lost updates.
- Redis limits message, edit, reaction, and typing request bursts per user/channel.

## Data and event security

- Durable state, audit records, and realtime outbox events are committed atomically.
- SSE channel subscriptions are authorized before Redis subscription.
- Typing events are ephemeral and carry an eight-second expiry.
- Deletion removes the active body but preserves a restricted revision for governance until retention purges it.
- Audit records contain identifiers and changed-field metadata, not chat bodies or internal secrets.
- Mention/message notifications honor channel-level mute settings and Sprint 28 notification preferences.

## Internal operations

- Retention maintenance uses a separate high-entropy secret and constant-time comparison.
- Do not reuse the auth signing secret, realtime publisher secret, or notification internal secret.
- Route the internal endpoint through a private scheduler/network policy where infrastructure supports it.
- Rotate the secret by updating the scheduler and application environment together.

## Deployment safety

- Real `.env` files are ignored and excluded from the ZIP.
- Apply only the committed migration in production with `prisma migrate deploy`.
- Back up PostgreSQL before migration and validate restoration procedures.
- Terminate TLS at the trusted edge, preserve secure cookie settings, and disable intermediary buffering for SSE.

## Coordinated release controls

- API tenant/user identity is derived from the signed session and validated active `AuthSession`; caller-supplied tenant, user, and platform-admin headers are never an authorization source.
- Additive permissions separate marketplace profile/listing/proposal/contract, delivery, file read/manage, AI use/manage, finance read/manage, analytics, search, support, security events, and exports.
- Every coordinated browser mutation validates CSRF before parsing or changing state. Internal workers use independent secrets; payment webhooks use raw-body HMAC and replay-deduplicated event IDs.
- Queries anchor organization-owned resources to `context.organizationId`. Cross-tenant marketplace visibility is limited to explicitly published public listings.
- File keys are opaque and tenant-prefixed. Signed operations are short-lived provider results; downloads are refused unless scanning reports `CLEAN`. Legal hold/retention state is persistent.
- AI requires tenant enablement, allowed use case, optional human approval, token budget, queued worker execution, provider failure handling, usage records, and audit logs.
- Financial amounts use `BigInt` minor units, transaction creation uses tenant idempotency keys, and provider credentials are environment-only.
- Search queries are hashed in logs; output queries are tenant-scoped. API envelopes do not return stack traces, secrets, or raw internal errors.

Production operators must add edge rate limiting/WAF, CSP and security headers appropriate to deployment, secret rotation, centralized logs/traces, database encryption/backups, Redis ACL/TLS, scanner callbacks, and tested incident/restore procedures.

The release audit has no high/critical findings. Moderate transitive advisories in Prisma development tooling and Next.js-bundled PostCSS have no non-breaking automated remediation in the resolved dependency graph; monitor upstream stable releases and verify before updating.
