import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/policy-engine";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { requireChatChannelAccess } from "@/lib/chat/access";
import { REALTIME_EVENTS, REALTIME_TOPICS } from "@/lib/realtime/topics";
import type { TenantContext } from "@/lib/tenancy/context";
import type {
  AddChatMemberInput,
  CreateChatChannelInput,
  ListChatChannelsInput,
  UpdateChatChannelInput,
  UpdateChatMemberInput,
} from "@/lib/validation/chat";

const channelSummaryInclude = (userId: string) =>
  ({
    members: {
      where: { userId, isActive: true },
      select: {
        role: true,
        notificationLevel: true,
        lastReadSequence: true,
        lastReadAt: true,
        mutedUntil: true,
      },
      take: 1,
    },
    messages: {
      where: { parentId: null },
      orderBy: { sequence: "desc" as const },
      take: 1,
      select: {
        id: true,
        sequence: true,
        body: true,
        format: true,
        authorId: true,
        deletedAt: true,
        createdAt: true,
      },
    },
    _count: {
      select: { members: { where: { isActive: true } }, messages: true },
    },
  }) satisfies Prisma.ChatChannelInclude;

type ChannelSummaryRow = Prisma.ChatChannelGetPayload<{
  include: ReturnType<typeof channelSummaryInclude>;
}>;

function summarizeChannel(channel: ChannelSummaryRow) {
  const { members, ...summary } = channel;
  const member = members[0] ?? null;
  const unreadCount = member
    ? channel.sequence > member.lastReadSequence
      ? channel.sequence - member.lastReadSequence
      : BigInt(0)
    : channel.sequence;

  return { ...summary, member, unreadCount };
}

async function assertEligibleMembers(
  organizationId: string,
  projectId: string | undefined,
  userIds: string[],
) {
  if (userIds.length === 0) return;

  const organizationMembers = await prisma.membership.findMany({
    where: {
      organizationId,
      userId: { in: userIds },
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  const organizationMemberIds = new Set(organizationMembers.map((entry) => entry.userId));
  const missingOrganizationMembers = userIds.filter((userId) => !organizationMemberIds.has(userId));
  if (missingOrganizationMembers.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Every channel member must be an active organization member.",
      409,
      { userIds: missingOrganizationMembers },
    );
  }

  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      memberships: {
        where: { userId: { in: userIds } },
        select: { userId: true },
      },
    },
  });
  const projectMemberIds = new Set(project?.memberships.map((entry) => entry.userId) ?? []);
  if (project?.ownerId) projectMemberIds.add(project.ownerId);
  const missingProjectMembers = userIds.filter((userId) => !projectMemberIds.has(userId));
  if (missingProjectMembers.length > 0) {
    throw new AppError(
      "CONFLICT",
      "Project channel members must already have project access.",
      409,
      { userIds: missingProjectMembers },
    );
  }
}

export class ChatChannelService {
  async list(context: TenantContext, input: ListChatChannelsInput) {
    await requirePermission(context, "chat.read");

    const visibilityFilter: Prisma.ChatChannelWhereInput = context.isPlatformAdmin
      ? {}
      : {
          OR: [
            { members: { some: { userId: context.userId, isActive: true } } },
            { visibility: "ORGANIZATION" },
            {
              visibility: "PROJECT",
              project: {
                is: {
                  OR: [
                    { ownerId: context.userId },
                    { memberships: { some: { userId: context.userId } } },
                  ],
                },
              },
            },
          ],
        };

    const rows = await prisma.chatChannel.findMany({
      where: {
        organizationId: context.organizationId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.includeArchived ? {} : { isArchived: false }),
        AND: [visibilityFilter],
      },
      include: channelSummaryInclude(context.userId),
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > input.take;
    const items = (hasMore ? rows.slice(0, input.take) : rows).map(summarizeChannel);
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async get(context: TenantContext, channelId: string) {
    await requireChatChannelAccess(context, channelId, "READ");
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: channelSummaryInclude(context.userId),
    });
    if (!channel) throw new AppError("NOT_FOUND", "Chat channel not found.", 404);
    return summarizeChannel(channel);
  }

  async create(context: TenantContext, input: CreateChatChannelInput) {
    await requirePermission(context, "chat.channel.create");

    if (input.memberUserIds.includes(context.userId)) {
      throw new AppError("VALIDATION_ERROR", "Do not include yourself in memberUserIds.", 422);
    }

    if (input.projectId) {
      await requireProjectAccess(context, input.projectId, ["OWNER", "MANAGER"]);
    }
    await assertEligibleMembers(context.organizationId, input.projectId, input.memberUserIds);

    const memberIds = [context.userId, ...input.memberUserIds];
    const directKey =
      input.type === "DIRECT"
        ? `${context.organizationId}:${[...memberIds].sort().join(":")}`
        : undefined;

    if (directKey) {
      const existing = await prisma.chatChannel.findUnique({ where: { directKey } });
      if (existing) return this.get(context, existing.id);
    }

    try {
      const channel = await prisma.$transaction(async (tx) => {
        const created = await tx.chatChannel.create({
          data: {
            organizationId: context.organizationId,
            projectId: input.projectId,
            createdById: context.userId,
            type: input.type,
            visibility: input.visibility,
            name: input.name,
            slug: input.slug,
            description: input.description,
            directKey,
            retentionDays: input.retentionDays,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
            members: {
              create: memberIds.map((userId) => ({
                userId,
                role: input.type === "DIRECT" ? "MEMBER" : userId === context.userId ? "OWNER" : "MEMBER",
              })),
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId: context.userId,
            action: "chat.channel.create",
            resourceType: "ChatChannel",
            resourceId: created.id,
            outcome: "SUCCESS",
            metadata: { type: created.type, visibility: created.visibility, projectId: created.projectId },
          },
        });

        await tx.realtimeEvent.create({
          data: {
            organizationId: context.organizationId,
            projectId: created.projectId,
            topic: REALTIME_TOPICS.organization(context.organizationId),
            eventType: REALTIME_EVENTS.CHAT_CHANNEL_CREATED,
            aggregateType: "ChatChannel",
            aggregateId: created.id,
            actorUserId: context.userId,
            payload: { channelId: created.id, type: created.type, visibility: created.visibility, name: created.name },
          },
        });
        return created;
      });
      return this.get(context, channel.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (directKey) {
          const existing = await prisma.chatChannel.findUnique({ where: { directKey } });
          if (existing) return this.get(context, existing.id);
        }
        throw new AppError("CONFLICT", "A channel with the same unique identifier already exists.", 409);
      }
      throw error;
    }
  }

  async update(context: TenantContext, channelId: string, input: UpdateChatChannelInput) {
    const access = await requireChatChannelAccess(context, channelId, "MANAGE");
    if (
      !context.isPlatformAdmin &&
      access.member?.role !== "OWNER" &&
      (input.isArchived !== undefined || input.retentionDays !== undefined)
    ) {
      throw new AppError("FORBIDDEN", "Only channel owners can change lifecycle or retention settings.", 403);
    }

    const changedFields = Object.keys(input);
    const channel = await prisma.$transaction(async (tx) => {
      const updated = await tx.chatChannel.update({
        where: { id: channelId },
        data: {
          ...input,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "chat.channel.update",
          resourceType: "ChatChannel",
          resourceId: channelId,
          outcome: "SUCCESS",
          metadata: { changedFields },
        },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: updated.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_CHANNEL_UPDATED,
          aggregateType: "ChatChannel",
          aggregateId: channelId,
          actorUserId: context.userId,
          payload: { channelId, changedFields, isArchived: updated.isArchived },
        },
      });
      return updated;
    });
    return channel;
  }

  async listMembers(context: TenantContext, channelId: string) {
    await requireChatChannelAccess(context, channelId, "READ");
    return prisma.chatChannelMember.findMany({
      where: { channelId, isActive: true },
      select: {
        id: true,
        userId: true,
        role: true,
        notificationLevel: true,
        lastReadSequence: true,
        lastReadAt: true,
        mutedUntil: true,
        createdAt: true,
        user: { select: { displayName: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async addMember(context: TenantContext, channelId: string, input: AddChatMemberInput) {
    const access = await requireChatChannelAccess(context, channelId, "MANAGE");
    if (access.channel.type === "DIRECT") {
      throw new AppError("CONFLICT", "Direct channel membership is immutable.", 409);
    }
    if (input.role === "OWNER" && !context.isPlatformAdmin && access.member?.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only an owner can appoint another owner.", 403);
    }
    await assertEligibleMembers(
      context.organizationId,
      access.channel.projectId ?? undefined,
      [input.userId],
    );

    return prisma.$transaction(async (tx) => {
      const member = await tx.chatChannelMember.upsert({
        where: { channelId_userId: { channelId, userId: input.userId } },
        create: { channelId, ...input },
        update: { ...input, isActive: true, removedAt: null },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_MEMBER_UPDATED,
          aggregateType: "ChatChannelMember",
          aggregateId: member.id,
          actorUserId: context.userId,
          payload: { channelId, userId: input.userId, role: member.role, action: "added" },
        },
      });
      return member;
    });
  }

  async updateMember(
    context: TenantContext,
    channelId: string,
    userId: string,
    input: UpdateChatMemberInput,
  ) {
    const isSelfPreferenceUpdate =
      userId === context.userId && input.role === undefined;
    const access = await requireChatChannelAccess(
      context,
      channelId,
      isSelfPreferenceUpdate ? "READ" : "MANAGE",
    );

    if (access.channel.type === "DIRECT" && input.role !== undefined) {
      throw new AppError("CONFLICT", "Direct channel roles are immutable.", 409);
    }
    if (input.role === "OWNER" && !context.isPlatformAdmin && access.member?.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only an owner can appoint another owner.", 403);
    }

    const target = await prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!target?.isActive) throw new AppError("NOT_FOUND", "Active channel member not found.", 404);
    if (target.role === "OWNER" && input.role && input.role !== "OWNER") {
      const owners = await prisma.chatChannelMember.count({
        where: { channelId, role: "OWNER", isActive: true },
      });
      if (owners <= 1) throw new AppError("CONFLICT", "A channel must retain at least one owner.", 409);
    }

    return prisma.$transaction(async (tx) => {
      const member = await tx.chatChannelMember.update({
        where: { channelId_userId: { channelId, userId } },
        data: input,
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_MEMBER_UPDATED,
          aggregateType: "ChatChannelMember",
          aggregateId: member.id,
          actorUserId: context.userId,
          payload: { channelId, userId, role: member.role, action: "updated" },
        },
      });
      return member;
    });
  }

  async removeMember(context: TenantContext, channelId: string, userId: string) {
    const access = await requireChatChannelAccess(context, channelId, "MANAGE");
    if (access.channel.type === "DIRECT") {
      throw new AppError("CONFLICT", "Direct channel membership is immutable.", 409);
    }
    const target = await prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!target?.isActive) throw new AppError("NOT_FOUND", "Active channel member not found.", 404);
    if (target.role === "OWNER") {
      if (!context.isPlatformAdmin && access.member?.role !== "OWNER") {
        throw new AppError("FORBIDDEN", "Only an owner can remove another owner.", 403);
      }
      const owners = await prisma.chatChannelMember.count({ where: { channelId, role: "OWNER", isActive: true } });
      if (owners <= 1) throw new AppError("CONFLICT", "The final channel owner cannot be removed.", 409);
    }

    return prisma.$transaction(async (tx) => {
      const member = await tx.chatChannelMember.update({
        where: { channelId_userId: { channelId, userId } },
        data: { isActive: false, removedAt: new Date() },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          projectId: access.channel.projectId,
          topic: REALTIME_TOPICS.chatChannel(channelId),
          eventType: REALTIME_EVENTS.CHAT_MEMBER_UPDATED,
          aggregateType: "ChatChannelMember",
          aggregateId: member.id,
          actorUserId: context.userId,
          payload: { channelId, userId, action: "removed" },
        },
      });
      return { removed: true };
    });
  }
}
