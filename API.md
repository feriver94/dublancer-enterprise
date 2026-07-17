# Sprint 29 Chat API

All browser routes require the existing authenticated session. Every `POST`, `PATCH`, and `DELETE` route also requires the existing `x-csrf-token` header and matching `dublancer_csrf` cookie. Responses use the existing `{ data, meta? }` and `{ error }` envelopes.

## Channels

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/chat/channels` | List accessible channels; accepts `cursor`, `take`, `projectId`, `includeArchived`. |
| `POST` | `/api/chat/channels` | Create project, group, direct, or announcement channel. |
| `GET` | `/api/chat/channels/:channelId` | Get an authorized channel summary and unread count. |
| `PATCH` | `/api/chat/channels/:channelId` | Update channel metadata, archive state, or retention policy. |

Direct create requires exactly one other `memberUserIds` entry and is idempotent for the same organization/user pair. Project create requires `PROJECT` visibility and project owner/manager access.

## Membership

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/chat/channels/:channelId/members` | List active members and read state. |
| `POST` | `/api/chat/channels/:channelId/members` | Add/reactivate a member. |
| `PATCH` | `/api/chat/channels/:channelId/members/:userId` | Change role or personal notification/mute settings. |
| `DELETE` | `/api/chat/channels/:channelId/members/:userId` | Soft-remove a member. |

## Messages and threads

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/chat/channels/:channelId/messages` | Read timeline or thread using `beforeSequence`, `afterSequence`, `parentId`, and `take`. |
| `POST` | `/api/chat/channels/:channelId/messages` | Post a message/reply with optional UUID `clientMessageId` and mentions. |
| `PATCH` | `/api/chat/channels/:channelId/messages/:messageId` | Edit an authored message using `expectedVersion`. |
| `DELETE` | `/api/chat/channels/:channelId/messages/:messageId` | Soft-delete authored content or moderate content. |
| `POST` | `/api/chat/channels/:channelId/messages/:messageId/reactions` | Add an emoji reaction. |
| `DELETE` | `/api/chat/channels/:channelId/messages/:messageId/reactions` | Remove the caller's emoji reaction. |

Default timeline reads return root messages. Supply a root `parentId` to retrieve its replies. Supply `afterSequence` after reconnect to catch up in ascending order.

## Collaboration state

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/chat/channels/:channelId/read` | Advance the caller's monotonic read watermark. |
| `POST` | `/api/chat/channels/:channelId/typing` | Publish an ephemeral typing state. |
| `GET` | `/api/realtime/stream?channelId=:channelId` | Subscribe to authorized chat events over SSE. |

Durable event types include `chat.channel.*`, `chat.member.updated`, `chat.message.*`, `chat.reaction.updated`, and `chat.read.updated`. `chat.typing.updated` is ephemeral.

## Internal maintenance

`POST /api/internal/chat/retention` requires `x-internal-chat-secret` matching `INTERNAL_CHAT_MAINTENANCE_SECRET`. Body:

```json
{ "batchSize": 500 }
```

Call repeatedly while `data.hasMore` is true.

## Coordinated product APIs

All browser mutations below require the authenticated cookie session and CSRF cookie/header pair. RBAC is evaluated against the active organization.

| Area | Methods and routes |
|---|---|
| Marketplace | `GET/POST /api/marketplace/listings`, `GET/PUT /api/marketplace/profile`, `GET/POST /api/marketplace/proposals`, `PATCH /api/marketplace/proposals/:proposalId` |
| Contracts | `GET/POST /api/contracts` |
| Delivery | `GET/POST /api/projects/:projectId/delivery` (`timeEntry`, `risk`, `deliverable`, `changeRequest`) |
| Files | `GET/POST /api/files`, `POST /api/files/upload-intents`, `GET /api/files/:fileId/download` |
| Governed AI | `GET/POST /api/ai/runs`, `POST /api/ai/runs/:runId/approval` |
| Finance | `GET/POST /api/finance/invoices`, `POST /api/finance/charges` |
| Search/analytics | `GET /api/search`, `GET /api/analytics/summary` |
| Administration | `GET /api/admin/security-events`, `GET/POST /api/admin/support-cases`, `POST /api/admin/data-exports` |

`POST /api/internal/workers/ai` requires `x-worker-secret`. `POST /api/webhooks/payments/:providerKey` does not use browser CSRF; it requires `x-provider-event-id` and a valid `x-provider-signature` HMAC over the exact raw body.

Create/update payloads are bounded by `src/lib/validation/product.ts`. Monetary values are integer minor units. Provider actions return `202` when externally processing.
