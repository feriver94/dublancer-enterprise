import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireChatChannelAccess } from "@/lib/chat/access";
import { enforceChatRateLimit } from "@/lib/chat/rate-limit";
import { redis } from "@/lib/realtime/redis";
import { REALTIME_EVENTS, REALTIME_TOPICS } from "@/lib/realtime/topics";
import type { TenantContext } from "@/lib/tenancy/context";
import type {
  CreateChatMessageInput,
  ListChatMessagesInput,
  UpdateChatMessageInput,
} from "@/lib/validation/chat";

const messageSelect = {
  id: true,
  channelId: true,
  parentId: true,
  clientMessageId: true,
  sequence: true,
  body: true,
  format: true,
  replyCount: true,
  version: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, displayName: true } },
  deletedBy: { select: { id: true, displayName: true } },
  mentions: {
    select: { user: { select: { id: true, displayName: true } } },
  },
  reactions: {
    select: {
      id: true,
      emoji: true,
      createdAt: true,
      user: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ChatMessageSelect;

type TransactionClient = Prisma.TransactionClient;

async function validateMentionRecipients(input: {
  organizationId: string;
  projectId: string | null;
  visibility: "PRIVATE" | "PROJECT" | "ORGANIZATION";
  channelId: string;
  userIds: string[];
}) {
  if (input.userIds.length === 0) return;

  const organizationMembers = await prisma.membership.findMany({
    where: {
      organizationId: input.organizationId,
      userId: { in: input.userIds },
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  const eligible = new Set(organizationMembers.map((entry) => entry.userId));

  if (input.visibility === "PRIVATE") {
    const channelMembers = await prisma.chatChannelMember.findMany({
      where: { channelId: input.channelId, userId: { in: input.userIds }, isActive: true },
      select: { userId: true },
    });
    const channelMemberIds = new Set(channelMembers.map((entry) => entry.userId));
    for (const userId of input.userIds) {
      if (!channelMemberIds.has(userId)) eligible.delete(userId);
    }
  }

  if (input.visibility === "PROJECT" && input.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: {
        ownerId: true,
        memberships: {
          where: { userId: { in: input.userIds } },
          select: { userId: true },
        },
      },
    });
    const projectMemberIds = new Set(project?.memberships.map((entry) => entry.userId) ?? []);
    if (project?.ownerId) projectMemberIds.add(project.ownerId);
    for (const userId of input.userIds) {
      if (!projectMemberIds.has(userId)) eligible.delete(userId);
    }
  }

  const rejected = input.userIds.filter((userId) => !eligible.has(userId));
  if (rejected.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Mentioned users must have access to this channel.",
      409,
      { userIds: rejected },
    );
  }
}

async function createChatNotifications(
  tx: TransactionClient,
  input: {
    organizationId: string;
    projectId: string | null;
    channelId: string;
    channelName: string | null;
    messageId: string;
    messageBody: string;
    messageVersion: number;
    actorUserId: string;
    mentionedUserIds: string[];
    mentionOnly?: boolean;
  },
) {
  const now = new Date();
  const channelMembers = await tx.chatChannelMember.findMany({
    where: {
      channelId: input.channelId,
      isActive: true,
      userId: { not: input.actorUserId },
    },
    select: {
      userId: true,
      notificationLevel: true,
      mutedUntil: true,
    },
  });
  const memberByUserId = new Map(channelMembers.map((member) => [member.userId, member]));
  const candidates = new Set<string>();

  for (const member of channelMembers) {
    const mentioned = input.mentionedUserIds.includes(member.userId);
    const muted = member.mutedUntil !== null && member.mutedUntil > now;
    if (
      !muted &&
      ((mentioned && member.notificationLevel !== "NONE") ||
        (!input.mentionOnly && member.notificationLevel === "ALL"))
    ) {
      candidates.add(member.userId);
    }
  }
  for (const userId of input.mentionedUserIds) {
    if (userId !== input.actorUserId && !memberByUserId.has(userId)) candidates.add(userId);
  }

  if (candidates.size === 0) return;
  const userIds = [...candidates];
  const preferences = await tx.notificationPreference.findMany({
    where: {
      userId: { in: userIds },
      category: "CHAT",
      channel: "IN_APP",
      OR: [{ organizationId: input.organizationId }, { organizationId: null }],
    },
  });

  for (const userId of userIds) {
    const organizationPreference = preferences.find(
      (preference) => preference.userId === userId && preference.organizationId === input.organizationId,
    );
    const globalPreference = preferences.find(
      (preference) => preference.userId === userId && preference.organizationId === null,
    );
    if ((organizationPreference?.enabled ?? globalPreference?.enabled ?? true) === false) continue;

    const isMention = input.mentionedUserIds.includes(userId);
    const notification = await tx.userNotification.create({
      data: {
        userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        type: isMention ? "CHAT_MENTION" : "CHAT_MESSAGE",
        category: "CHAT",
        priority: isMention ? "HIGH" : "NORMAL",
        title: isMention ? "You were mentioned" : `New message${input.channelName ? ` in ${input.channelName}` : ""}`,
        body: input.messageBody.slice(0, 280),
        actionUrl: `/communications/chat?channelId=${encodeURIComponent(input.channelId)}&messageId=${encodeURIComponent(input.messageId)}`,
        dedupeKey: `chat:${input.messageId}:${input.messageVersion}:${userId}`,
        metadata: { channelId: input.channelId, messageId: input.messageId, actorUserId: input.actorUserId },
        deliveries: {
          create: {
            userId,
            channel: "IN_APP",
            status: "DELIVERED",
            deliveredAt: now,
          },
        },
      },
    });

    await tx.realtimeEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        topic: REALTIME_TOPICS.user(userId),
        eventType: REALTIME_EVENTS.NOTIFICATION_CREATED,
        aggregateType: "UserNotification",
        aggregateId: notification.id,
        actorUserId: input.actorUserId,
        payload: {
          notificationId: notification.id,
          type: notification.type,
          category: notification.category,
          priority: notification.priority,
          title: notification.title,
          body: notification.body,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt.toISOString(),
        },
      },
    });
  }
}

export class ChatMessageService {
  private async getMessage(channelId: string, messageId: string) {
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId },
      select: messageSelect,
    });
    if (!message) throw new AppError("NOT_FOUND", "Chat message not found.", 404);
    return message;
  }

  async list(context: TenantContext, channelId: string, input: ListChatMessagesInput) {
    const access = await requireChatChannelAccess(context, channelId, "READ");
    if (input.beforeSequence !== undefined && input.afterSequence !== undefined) {
      throw new AppError("VALIDATION_ERROR", "Use beforeSequence or afterSequence, not both.", 422);
    }

    if (input.parentId) {
      const parent = await prisma.chatMessage.findFirst({
        where: { id: input.parentId, channelId, parentId: null },
        select: { id: true },
      });
      if (!parent) throw new AppError("NOT_FOUND", "Thread root message not found.", 404);
    }

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { retentionDays: true },
    });
    const retainedAfter = channel?.retentionDays
      ? new Date(Date.now() - channel.retentionDays * 86_400_000)
      : undefined;
    const sequenceFilter =
      input.beforeSequence !== undefined
        ? { lt: input.beforeSequence }
        : input.afterSequence !== undefined
          ? { gt: input.afterSequence }
          : undefined;
    const ascending = input.afterSequence !== undefined;

    const rows = await prisma.chatMessage.findMany({
      where: {
        channelId,
        parentId: input.parentId ?? null,
        ...(sequenceFilter ? { sequence: sequenceFilter } : {}),
        ...(retainedAfter ? { createdAt: { gte: retainedAfter } } : {}),
      },
      select: messageSelect,
      orderBy: { sequence: ascending ? "asc" : "desc" },
      take: input.take + 1,
    });
    const hasMore = rows.length > input.take;
    const items = hasMore ? rows.slice(0, input.take) : rows;
    return {
      items,
      nextSequence: hasMore ? items.at(-1)?.sequence ?? null : null,
      direction: ascending ? "forward" : "backward",
      channelSequence: access.channel.sequence,
    };
  }

  async create(context: TenantContext, channelId: string, input: CreateChatMessageInput) {
    await requireChatChannelAccess(context, channelId, "POST");
    if (input.clientMessageId) {
      const existing = await prisma.chatMessage.findUnique({
        where: { channelId_clientMessageId: { channelId, clientMessageId: input.clientMessageId } },
        select: messageSelect,
      });
      if (existing) return existing;
    }

    await enforceChatRateLimit({
      scope: "message",
      userId: context.userId,
      channelId,
      limit: 30,
      windowMs: 60_000,
    });

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { projectId: true, visibility: true, name: true },
    });
    if (!channel) throw new AppError("NOT_FOUND", "Chat channel not found.", 404);
    await validateMentionRecipients({
      organizationId: context.organizationId,
      projectId: channel.projectId,
      visibility: channel.visibility,
      channelId,
      userIds: input.mentionedUserIds,
    });

    if (input.parentId) {
      const parent = await prisma.chatMessage.findFirst({
        where: { id: input.parentId, channelId, parentId: null, deletedAt: null },
        select: { id: true },
      });
      if (!parent) throw new AppError("NOT_FOUND", "Thread root message not found.", 404);
    }

    try {
      const messageId = await prisma.$transaction(async (tx) => {
        const sequencedChannel = await tx.chatChannel.update({
          where: { id: channelId },
          data: { sequence: { increment: 1 }, lastMessageAt: new Date() },
          select: { sequence: true },
        });
        await tx.chatChannelMember.upsert({
          where: { channelId_userId: { channelId, userId: context.userId } },
          create: { channelId, userId: context.userId, role: "MEMBER" },
          update: { isActive: true, removedAt: null },
        });
        const message = await tx.chatMessage.create({
          data: {
            channelId,
            authorId: context.userId,
            parentId: input.parentId,
            clientMessageId: input.clientMessageId,
            sequence: sequencedChannel.sequence,
            body: input.body,
            format: input.format,
            mentions: {
              create: input.mentionedUserIds.map((userId) => ({ userId })),
            },
          },
        });
        if (input.parentId) {
          await tx.chatMessage.update({
            where: { id: input.parentId },
            data: { replyCount: { increment: 1 } },
          });
        }
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId: context.userId,
            action: "chat.message.create",
            resourceType: "ChatMessage",
            resourceId: message.id,
            outcome: "SUCCESS",
            metadata: { channelId, sequence: message.sequence.toString(), parentId: message.parentId },
          },
        });
        await tx.realtimeEvent.create({
          data: {
            organizationId: context.organizationId,
            projectId: channel.projectId,
            topic: REALTIME_TOPICS.chatChannel(channelId),
            eventType: REALTIME_EVENTS.CHAT_MESSAGE_CREATED,
            aggregateType: "ChatMessage",
            aggregateId: message.id,
            actorUserId: context.userId,
            payload: {
              channelId,
              messageId: message.id,
              parentId: message.parentId,
              sequence: message.sequence.toString(),
              body: message.body,
              format: message.format,
              version: message.version,
              authorId: message.authorId,
              mentionedUserIds: input.mentionedUserIds,
              createdAt: message.createdAt.toISOString(),
            },
          },
        });
        await createChatNotifications(tx, {
          organizationId: context.organizationId,
          projectId: channel.projectId,
          channelId,
          channelName: channel.name,
          messageId: message.id,
          messageBody: message.body,
          messageVersion: message.version,
          actorUserId: context.userId,
          mentionedUserIds: input.mentionedUserIds,
        });
        return message.id;
      });
      return this.getMessage(channelId, messageId);
    } catch (error) {
      if (
        input.clientMessageId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.chatMessage.findUnique({
          where: { channelId_clientMessageId: { channelId, clientMessageId: input.clientMessageId } },
          select: messageSelect,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async update(
    context: TenantContext,
    channelId: string,
    messageId: string,
    input: UpdateChatMessageInput,
  ) {
    await requireChatChannelAccess(context, channelId, "POST");
    await enforceChatRateLimit({ scope: "edit", userId: context.userId, channelId, limit: 20, windowMs: 60_000 });
    const existing = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId },
      select: { id: true, authorId: true, body: true, version: true, deletedAt: true },
    });
    if (!existing) throw new AppError("NOT_FOUND", "Chat message not found.", 404);
    if (existing.authorId !== context.userId) {
      throw new AppError("FORBIDDEN", "Only the message author can edit this message.", 403);
    }
    if (existing.deletedAt) throw new AppError("CONFLICT", "Deleted messages cannot be edited.", 409);
    if (existing.version !== input.expectedVersion) {
      throw new AppError("CONFLICT", "The message was updated by another request.", 409, { currentVersion: existing.version });
    }

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { projectId: true, visibility: true, name: true },
    });
    if (!channel) throw new AppError("NOT_FOUND", "Chat channel not found.", 404);
    await validateMentionRecipients({
      organizationId: context.organizationId,
      projectId: channel.projectId,
      visibility: channel.visibility,
      channelId,
      userIds: input.mentionedUserIds,
    });

    await prisma.$transaction(async (tx) => {
      await tx.chatMessageRevision.create({
        data: {
          messageId,
          editedById: context.userId,
          version: existing.version,
          previousBody: existing.body,
          reason: input.reason,
        },
      });
      const result = await tx.chatMessage.updateMany({
        where: { id: messageId, channelId, version: input.expectedVersion, deletedAt: null },
        data: { body: input.body, version: { increment: 1 }, editedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new AppError("CONFLICT", "The message was updated by another request.", 409);
      }
      await tx.chatMention.deleteMany({ where: { messageId } });
      if (input.mentionedUserIds.length > 0) {
        await tx.chatMention.createMany({
          data: input.mentionedUserIds.map((userId) => ({ messageId, userId })),
          skipDuplicates: true,
        });
      }
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "chat.message.update",
          resourceType: "ChatMessage",
          resourceId: messageId,
          outcome: "SUCCESS",
          metadata: { channelId, fromVersion: existing.version, toVersion: existing.version + 1 },
        },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_MESSAGE_UPDATED,
          aggregateType: "ChatMessage",
          aggregateId: messageId,
          actorUserId: context.userId,
          payload: {
            channelId,
            messageId,
            body: input.body,
            version: existing.version + 1,
            mentionedUserIds: input.mentionedUserIds,
            editedAt: new Date().toISOString(),
          },
        },
      });
      await createChatNotifications(tx, {
        organizationId: context.organizationId,
        projectId: channel.projectId,
        channelId,
        channelName: channel.name,
        messageId,
        messageBody: input.body,
        messageVersion: existing.version + 1,
        actorUserId: context.userId,
        mentionedUserIds: input.mentionedUserIds,
        mentionOnly: true,
      });
    });
    return this.getMessage(channelId, messageId);
  }

  async remove(context: TenantContext, channelId: string, messageId: string) {
    const access = await requireChatChannelAccess(context, channelId, "READ");
    const existing = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId },
      select: { id: true, authorId: true, body: true, version: true, deletedAt: true },
    });
    if (!existing) throw new AppError("NOT_FOUND", "Chat message not found.", 404);
    if (existing.deletedAt) return { deleted: true };

    if (existing.authorId !== context.userId) {
      await requireChatChannelAccess(context, channelId, "MANAGE");
    } else if (access.channel.isArchived) {
      throw new AppError("CONFLICT", "Archived channels are read-only.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatMessageRevision.create({
        data: {
          messageId,
          editedById: context.userId,
          version: existing.version,
          previousBody: existing.body,
          reason: "Message deleted",
        },
      });
      await tx.chatMessage.update({
        where: { id: messageId },
        data: {
          body: "",
          deletedAt: new Date(),
          deletedById: context.userId,
          version: { increment: 1 },
          mentions: { deleteMany: {} },
          reactions: { deleteMany: {} },
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "chat.message.delete",
          resourceType: "ChatMessage",
          resourceId: messageId,
          outcome: "SUCCESS",
          metadata: { channelId, authorId: existing.authorId, moderated: existing.authorId !== context.userId },
        },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_MESSAGE_DELETED,
          aggregateType: "ChatMessage",
          aggregateId: messageId,
          actorUserId: context.userId,
          payload: { channelId, messageId, deletedAt: new Date().toISOString() },
        },
      });
    });
    return { deleted: true };
  }

  async addReaction(context: TenantContext, channelId: string, messageId: string, emoji: string) {
    const access = await requireChatChannelAccess(context, channelId, "POST");
    await enforceChatRateLimit({ scope: "reaction", userId: context.userId, channelId, limit: 60, windowMs: 60_000 });
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId, deletedAt: null },
      select: { id: true },
    });
    if (!message) throw new AppError("NOT_FOUND", "Active chat message not found.", 404);
    return prisma.$transaction(async (tx) => {
      const reaction = await tx.chatReaction.upsert({
        where: { messageId_userId_emoji: { messageId, userId: context.userId, emoji } },
        create: { messageId, userId: context.userId, emoji },
        update: {},
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_REACTION_UPDATED,
          aggregateType: "ChatReaction",
          aggregateId: reaction.id,
          actorUserId: context.userId,
          payload: { channelId, messageId, userId: context.userId, emoji, action: "added" },
        },
      });
      return reaction;
    });
  }

  async removeReaction(context: TenantContext, channelId: string, messageId: string, emoji: string) {
    const access = await requireChatChannelAccess(context, channelId, "POST");
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.chatReaction.deleteMany({
        where: { messageId, userId: context.userId, emoji, message: { channelId } },
      });
      if (deleted.count > 0) {
        await tx.realtimeEvent.create({
          data: {
            organizationId: context.organizationId,
            projectId: access.channel.projectId,
            topic: REALTIME_TOPICS.chatChannel(channelId),
            eventType: REALTIME_EVENTS.CHAT_REACTION_UPDATED,
            aggregateType: "ChatMessage",
            aggregateId: messageId,
            actorUserId: context.userId,
            payload: { channelId, messageId, userId: context.userId, emoji, action: "removed" },
          },
        });
      }
      return deleted;
    });
    return { removed: result.count > 0 };
  }

  async markRead(context: TenantContext, channelId: string, sequence: bigint) {
    const access = await requireChatChannelAccess(context, channelId, "READ");
    if (sequence > access.channel.sequence) {
      throw new AppError("VALIDATION_ERROR", "Read sequence exceeds the channel sequence.", 422);
    }
    return prisma.$transaction(async (tx) => {
      await tx.chatChannelMember.upsert({
        where: { channelId_userId: { channelId, userId: context.userId } },
        create: {
          channelId,
          userId: context.userId,
          role: "MEMBER",
          lastReadSequence: sequence,
          lastReadAt: new Date(),
        },
        update: { isActive: true, removedAt: null },
      });
      await tx.chatChannelMember.updateMany({
        where: { channelId, userId: context.userId, lastReadSequence: { lt: sequence } },
        data: { lastReadSequence: sequence, lastReadAt: new Date() },
      });
      const member = await tx.chatChannelMember.findUniqueOrThrow({
        where: { channelId_userId: { channelId, userId: context.userId } },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_READ_UPDATED,
          aggregateType: "ChatChannelMember",
          aggregateId: member.id,
          actorUserId: context.userId,
          payload: { channelId, userId: context.userId, sequence: member.lastReadSequence.toString(), readAt: member.lastReadAt?.toISOString() },
        },
      });
      return { sequence: member.lastReadSequence, readAt: member.lastReadAt };
    });
  }

  async typing(context: TenantContext, channelId: string, active: boolean) {
    await requireChatChannelAccess(context, channelId, "POST");
    await enforceChatRateLimit({ scope: "typing", userId: context.userId, channelId, limit: 30, windowMs: 10_000 });
    const payload = {
      id: crypto.randomUUID(),
      eventType: REALTIME_EVENTS.CHAT_TYPING_UPDATED,
      organizationId: context.organizationId,
      actorUserId: context.userId,
      payload: {
        channelId,
        userId: context.userId,
        active,
        expiresAt: new Date(Date.now() + 8_000).toISOString(),
      },
      createdAt: new Date().toISOString(),
    };
    await redis.publish(REALTIME_TOPICS.chatChannel(channelId), JSON.stringify(payload));
    return { accepted: true, expiresAt: payload.payload.expiresAt };
  }
}
