-- Sprint 29: Enterprise realtime chat and collaboration

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('PROJECT', 'GROUP', 'DIRECT', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "ChatChannelVisibility" AS ENUM ('PRIVATE', 'PROJECT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChatNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "ChatMessageFormat" AS ENUM ('PLAIN_TEXT', 'MARKDOWN');

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "type" "ChatChannelType" NOT NULL,
    "visibility" "ChatChannelVisibility" NOT NULL DEFAULT 'PRIVATE',
    "name" TEXT,
    "slug" TEXT,
    "description" TEXT,
    "directKey" TEXT,
    "sequence" BIGINT NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "retentionDays" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "notificationLevel" "ChatNotificationLevel" NOT NULL DEFAULT 'ALL',
    "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "deletedById" TEXT,
    "parentId" TEXT,
    "clientMessageId" TEXT,
    "sequence" BIGINT NOT NULL,
    "body" TEXT NOT NULL,
    "format" "ChatMessageFormat" NOT NULL DEFAULT 'PLAIN_TEXT',
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageRevision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousBody" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_directKey_key" ON "ChatChannel"("directKey");
CREATE UNIQUE INDEX "ChatChannel_organizationId_slug_key" ON "ChatChannel"("organizationId", "slug");
CREATE INDEX "ChatChannel_organizationId_isArchived_updatedAt_idx" ON "ChatChannel"("organizationId", "isArchived", "updatedAt");
CREATE INDEX "ChatChannel_projectId_isArchived_updatedAt_idx" ON "ChatChannel"("projectId", "isArchived", "updatedAt");
CREATE INDEX "ChatChannel_type_visibility_idx" ON "ChatChannel"("type", "visibility");
CREATE INDEX "ChatChannel_lastMessageAt_idx" ON "ChatChannel"("lastMessageAt");

CREATE UNIQUE INDEX "ChatChannelMember_channelId_userId_key" ON "ChatChannelMember"("channelId", "userId");
CREATE INDEX "ChatChannelMember_userId_isActive_updatedAt_idx" ON "ChatChannelMember"("userId", "isActive", "updatedAt");
CREATE INDEX "ChatChannelMember_channelId_isActive_role_idx" ON "ChatChannelMember"("channelId", "isActive", "role");

CREATE UNIQUE INDEX "ChatMessage_channelId_sequence_key" ON "ChatMessage"("channelId", "sequence");
CREATE UNIQUE INDEX "ChatMessage_channelId_clientMessageId_key" ON "ChatMessage"("channelId", "clientMessageId");
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");
CREATE INDEX "ChatMessage_parentId_createdAt_idx" ON "ChatMessage"("parentId", "createdAt");
CREATE INDEX "ChatMessage_authorId_createdAt_idx" ON "ChatMessage"("authorId", "createdAt");
CREATE INDEX "ChatMessage_channelId_deletedAt_sequence_idx" ON "ChatMessage"("channelId", "deletedAt", "sequence");

CREATE UNIQUE INDEX "ChatMessageRevision_messageId_version_key" ON "ChatMessageRevision"("messageId", "version");
CREATE INDEX "ChatMessageRevision_editedById_createdAt_idx" ON "ChatMessageRevision"("editedById", "createdAt");

CREATE UNIQUE INDEX "ChatMention_messageId_userId_key" ON "ChatMention"("messageId", "userId");
CREATE INDEX "ChatMention_userId_createdAt_idx" ON "ChatMention"("userId", "createdAt");

CREATE UNIQUE INDEX "ChatReaction_messageId_userId_emoji_key" ON "ChatReaction"("messageId", "userId", "emoji");
CREATE INDEX "ChatReaction_messageId_emoji_idx" ON "ChatReaction"("messageId", "emoji");
CREATE INDEX "ChatReaction_userId_createdAt_idx" ON "ChatReaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageRevision" ADD CONSTRAINT "ChatMessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageRevision" ADD CONSTRAINT "ChatMessageRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed additive RBAC permissions without changing custom roles.
INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES
    ('perm_chat_read', 'chat.read', 'Read accessible chat channels and messages.', CURRENT_TIMESTAMP),
    ('perm_chat_channel_create', 'chat.channel.create', 'Create collaboration channels.', CURRENT_TIMESTAMP),
    ('perm_chat_message_create', 'chat.message.create', 'Post messages and reactions.', CURRENT_TIMESTAMP),
    ('perm_chat_moderate', 'chat.moderate', 'Manage channels, memberships, and moderation.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "Role" AS role_row
JOIN "Permission" AS permission_row ON permission_row."key" = 'chat.read'
WHERE role_row."name" IN ('Owner', 'Admin', 'Manager', 'Member', 'Viewer')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "Role" AS role_row
JOIN "Permission" AS permission_row ON permission_row."key" IN ('chat.channel.create', 'chat.message.create')
WHERE role_row."name" IN ('Owner', 'Admin', 'Manager', 'Member')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "Role" AS role_row
JOIN "Permission" AS permission_row ON permission_row."key" = 'chat.moderate'
WHERE role_row."name" IN ('Owner', 'Admin', 'Manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
