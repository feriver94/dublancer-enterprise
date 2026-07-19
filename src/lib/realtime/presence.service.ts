import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { requireChatChannelAccess } from "@/lib/chat/access";
import { enqueueRealtimeEvent } from "./event-store";
import { REALTIME_EVENTS, REALTIME_TOPICS } from "./topics";

const PRESENCE_TTL_MS = 90_000;

export class PresenceService {
  async heartbeat(
    context: TenantContext,
    input: {
      connectionId?: string;
      projectId?: string;
      resourceType?: string;
      resourceId?: string;
      status: "ONLINE" | "AWAY";
      metadata?: Record<string, unknown>;
    },
  ) {
    if (input.projectId) {
      await requireProjectAccess(
        context,
        input.projectId,
        ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"],
      );
    }
    if (input.resourceType === "CHAT_CHANNEL") {
      if (!input.resourceId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Chat presence requires a channel resource ID.",
          422,
        );
      }
      await requireChatChannelAccess(context, input.resourceId, "READ");
    }

    const connectionId =
      input.connectionId ?? randomUUID();

    const presence = await prisma.presenceSession.upsert({
      where: {
        userId_connectionId: {
          userId: context.userId,
          connectionId,
        },
      },
      create: {
        userId: context.userId,
        organizationId: context.organizationId,
        projectId: input.projectId,
        connectionId,
        status: input.status,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        expiresAt: new Date(Date.now() + PRESENCE_TTL_MS),
      },
      update: {
        projectId: input.projectId,
        status: input.status,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        expiresAt: new Date(Date.now() + PRESENCE_TTL_MS),
      },
    });

    await enqueueRealtimeEvent({
      organizationId: context.organizationId,
      projectId: input.projectId,
      topic: input.projectId
        ? REALTIME_TOPICS.project(input.projectId)
        : REALTIME_TOPICS.organization(
            context.organizationId,
          ),
      eventType: REALTIME_EVENTS.PRESENCE_UPDATED,
      aggregateType: "PresenceSession",
      aggregateId: presence.id,
      actorUserId: context.userId,
      payload: {
        userId: context.userId,
        connectionId,
        status: presence.status,
        resourceType: presence.resourceType,
        resourceId: presence.resourceId,
        expiresAt: presence.expiresAt.toISOString(),
      },
    });

    return presence;
  }

  async listProjectPresence(
    context: TenantContext,
    projectId: string,
  ) {
    await requireProjectAccess(
      context,
      projectId,
      ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"],
    );

    const rows = await prisma.presenceSession.findMany({
      where: {
        projectId,
        status: { in: ["ONLINE", "AWAY"] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            preferredLocale: true,
          },
        },
      },
    });
    return rows;
  }

  async listChatPresence(
    context: TenantContext,
    channelId: string,
  ) {
    await requireChatChannelAccess(context, channelId, "READ");

    const rows = await prisma.presenceSession.findMany({
      where: {
        organizationId: context.organizationId,
        resourceType: "CHAT_CHANNEL",
        resourceId: channelId,
        status: { in: ["ONLINE", "AWAY"] },
        expiresAt: { gt: new Date() },
      },
      select: {
        userId: true,
        status: true,
        expiresAt: true,
        updatedAt: true,
        user: { select: { displayName: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return [...new Map(rows.map((row) => [row.userId, row])).values()];
  }

  async disconnect(
    context: TenantContext,
    connectionId: string,
  ) {
    return prisma.presenceSession.updateMany({
      where: {
        userId: context.userId,
        connectionId,
      },
      data: {
        status: "OFFLINE",
        expiresAt: new Date(),
      },
    });
  }
}
