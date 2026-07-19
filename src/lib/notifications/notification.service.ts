import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { REALTIME_EVENTS, REALTIME_TOPICS } from "@/lib/realtime/topics";
import type { TenantContext } from "@/lib/tenancy/context";

export type NotificationChannelInput =
  | "IN_APP"
  | "EMAIL"
  | "PUSH"
  | "SMS";

export type CreateNotificationInput = {
  userId: string;
  organizationId?: string;
  projectId?: string;
  type: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  title: string;
  body?: string;
  actionUrl?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
  channels: NotificationChannelInput[];
};

export type ListNotificationsInput = {
  status?: "UNREAD" | "READ" | "ARCHIVED";
  category?: string;
  cursor?: string;
  take: number;
};

export class NotificationService {
  async create(input: CreateNotificationInput) {
    return prisma.$transaction(async (tx) => {
      if (input.dedupeKey) {
        const existing = await tx.userNotification.findUnique({
          where: { dedupeKey: input.dedupeKey },
        });

        if (existing) {
          return existing;
        }
      }

      const preferences = await tx.notificationPreference.findMany({
        where: {
          userId: input.userId,
          category: input.category,
          channel: { in: input.channels },
          OR: [
            { organizationId: input.organizationId ?? null },
            { organizationId: null },
          ],
        },
      });

      const enabledChannels = input.channels.filter((channel) => {
        const organizationPreference = preferences.find(
          (preference) =>
            preference.channel === channel &&
            preference.organizationId === (input.organizationId ?? null),
        );

        const globalPreference = preferences.find(
          (preference) =>
            preference.channel === channel &&
            preference.organizationId === null,
        );

        return (
          organizationPreference?.enabled ??
          globalPreference?.enabled ??
          true
        );
      });

      const notification = await tx.userNotification.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          type: input.type,
          category: input.category,
          priority: input.priority,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          dedupeKey: input.dedupeKey,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
          expiresAt: input.expiresAt,
          deliveries: {
            create: enabledChannels.map((channel) => ({
              userId: input.userId,
              channel,
              status:
                channel === "IN_APP" ? "DELIVERED" : "PENDING",
              deliveredAt:
                channel === "IN_APP" ? new Date() : undefined,
            })),
          },
        },
      });

      await tx.realtimeEvent.create({
        data: {
          organizationId: input.organizationId ?? "platform",
          projectId: input.projectId,
          topic: REALTIME_TOPICS.user(input.userId),
          eventType: "notification.created",
          aggregateType: "UserNotification",
          aggregateId: notification.id,
          actorUserId: input.userId,
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

      return notification;
    });
  }

  async list(context: TenantContext, input: ListNotificationsInput) {
    const rows = await prisma.userNotification.findMany({
      where: {
        userId: context.userId,
        OR: [
          { organizationId: context.organizationId },
          { organizationId: null },
        ],
        ...(input.status ? { status: input.status } : {}),
        ...(input.category ? { category: input.category } : {}),
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      include: {
        deliveries: {
          select: { channel: true, status: true, attempts: true, deliveredAt: true, lastError: true },
          orderBy: { channel: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > input.take;
    const items = hasMore ? rows.slice(0, input.take) : rows;

    return {
      items,
      nextCursor: hasMore
        ? items.at(-1)?.id ?? null
        : null,
    };
  }

  async markRead(context: TenantContext, notificationId: string) {
    return this.setStatus(context, notificationId, "READ");
  }

  async markAllRead(context: TenantContext) {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.userNotification.updateMany({
        where: {
          userId: context.userId,
          status: "UNREAD",
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        data: { status: "READ", readAt: now },
      });
      if (updated.count > 0) {
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId: context.userId,
            action: "notification.read_all",
            resourceType: "UserNotification",
            outcome: "SUCCESS",
            metadata: { count: updated.count },
          },
        });
        await tx.realtimeEvent.create({
          data: {
            organizationId: context.organizationId,
            topic: REALTIME_TOPICS.user(context.userId),
            eventType: REALTIME_EVENTS.NOTIFICATION_UPDATED,
            aggregateType: "UserNotification",
            actorUserId: context.userId,
            payload: { action: "read_all", count: updated.count, status: "READ", updatedAt: now.toISOString() },
          },
        });
      }
      return updated;
    });

    return { updated: result.count };
  }

  async archive(context: TenantContext, notificationId: string) {
    await this.setStatus(context, notificationId, "ARCHIVED");
    return { archived: true };
  }

  async unreadCount(context: TenantContext) {
    const count = await prisma.userNotification.count({
      where: {
        userId: context.userId,
        status: "UNREAD",
        OR: [
          { organizationId: context.organizationId },
          { organizationId: null },
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
    });

    return { count };
  }

  async setStatus(
    context: TenantContext,
    notificationId: string,
    status: "UNREAD" | "READ" | "ARCHIVED",
  ) {
    const notification = await prisma.userNotification.findFirst({
      where: {
        id: notificationId,
        userId: context.userId,
        OR: [
          { organizationId: context.organizationId },
          { organizationId: null },
        ],
      },
      select: { id: true, readAt: true },
    });
    if (!notification) {
      throw new AppError("NOT_FOUND", "Notification not found.", 404);
    }
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.userNotification.update({
        where: { id: notificationId },
        data: {
          status,
          readAt: status === "READ" ? notification.readAt ?? now : status === "UNREAD" ? null : undefined,
          archivedAt: status === "ARCHIVED" ? now : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: `notification.${status.toLowerCase()}`,
          resourceType: "UserNotification",
          resourceId: notificationId,
          outcome: "SUCCESS",
        },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          topic: REALTIME_TOPICS.user(context.userId),
          eventType: REALTIME_EVENTS.NOTIFICATION_UPDATED,
          aggregateType: "UserNotification",
          aggregateId: notificationId,
          actorUserId: context.userId,
          payload: { notificationId, status, updatedAt: now.toISOString() },
        },
      });
      return updated;
    });
  }
}

const notificationService = new NotificationService();

/*
 * Compatibility exports:
 * Existing Dublancer files that import function-based APIs continue
 * to work, while new routes can use NotificationService directly.
 */
export const createNotification = (
  input: CreateNotificationInput,
) => notificationService.create(input);

export const listNotifications = (
  context: TenantContext,
  input: ListNotificationsInput,
) => notificationService.list(context, input);

export const markNotificationRead = (
  context: TenantContext,
  notificationId: string,
) => notificationService.markRead(context, notificationId);

export const markAllNotificationsRead = (context: TenantContext) =>
  notificationService.markAllRead(context);

export const archiveNotification = (
  context: TenantContext,
  notificationId: string,
) => notificationService.archive(context, notificationId);

export const getUnreadNotificationCount = (context: TenantContext) =>
  notificationService.unreadCount(context);

export const setNotificationStatus = (
  context: TenantContext,
  notificationId: string,
  status: "UNREAD" | "READ" | "ARCHIVED",
) => notificationService.setStatus(context, notificationId, status);
