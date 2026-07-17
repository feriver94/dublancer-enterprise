# Sprint 29 Delivery Manifest

## Database

- Complete `prisma/schema.prisma`
- `prisma/migrations/20260717023000_enterprise_realtime_chat_collaboration/migration.sql`

## New chat source

- `src/lib/chat/access.ts`
- `src/lib/chat/client.ts`
- `src/lib/chat/rate-limit.ts`
- `src/lib/services/chat-channel.service.ts`
- `src/lib/services/chat-message.service.ts`
- `src/lib/services/chat-retention.service.ts`
- `src/lib/validation/chat.ts`
- `src/app/api/chat/channels/route.ts`
- `src/app/api/chat/channels/[channelId]/route.ts`
- `src/app/api/chat/channels/[channelId]/members/route.ts`
- `src/app/api/chat/channels/[channelId]/members/[userId]/route.ts`
- `src/app/api/chat/channels/[channelId]/messages/route.ts`
- `src/app/api/chat/channels/[channelId]/messages/[messageId]/route.ts`
- `src/app/api/chat/channels/[channelId]/messages/[messageId]/reactions/route.ts`
- `src/app/api/chat/channels/[channelId]/read/route.ts`
- `src/app/api/chat/channels/[channelId]/typing/route.ts`
- `src/app/api/internal/chat/retention/route.ts`

## Modified integrations

- Realtime topics and authenticated channel SSE subscription
- Chat RBAC permissions and default-role definitions
- Complete User, Organization, and Project chat relations
- Sprint 28 notification service compatibility and chat delivery integration
- Shared validation, Prisma JSON compatibility, and inherited compile fixes listed in `CHANGELOG.md`

## Operations and documentation

- `README.md`, `API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `TESTING.md`, `CHANGELOG.md`
- `.env.chat.example`
- `VERIFY_SPRINT_29.ps1`
