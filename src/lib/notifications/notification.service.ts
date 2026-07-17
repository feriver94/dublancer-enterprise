import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { REALTIME_TOPICS } from "@/lib/realtime/topics";

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

  async list(userId: string, input: ListNotificationsInput) {
    const rows = await prisma.userNotification.findMany({
      where: {
        userId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.category ? { category: input.category } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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

  async markRead(userId: string, notificationId: string) {
    const notification = await prisma.userNotification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, readAt: true },
    });

    if (!notification) {
      throw new AppError(
        "NOT_FOUND",
        "Notification not found.",
        404,
      );
    }

    return prisma.userNotification.update({
      where: { id: notification.id },
      data: {
        status: "READ",
        readAt: notification.readAt ?? new Date(),
      },
    });
  }

  async markAllRead(userId: string) {
    const result = await prisma.userNotification.updateMany({
      where: { userId, status: "UNREAD" },
      data: { status: "READ", readAt: new Date() },
    });

    return { updated: result.count };
  }

  async archive(userId: string, notificationId: string) {
    const result = await prisma.userNotification.updateMany({
      where: { id: notificationId, userId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new AppError(
        "NOT_FOUND",
        "Notification not found.",
        404,
      );
    }

    return { archived: true };
  }

  async unreadCount(userId: string) {
    const count = await prisma.userNotification.count({
      where: {
        userId,
        status: "UNREAD",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    return { count };
  }

  async setStatus(
    userId: string,
    notificationId: string,
    status: "UNREAD" | "READ" | "ARCHIVED",
  ) {
    const notification = await prisma.userNotification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });
    if (!notification) {
      throw new AppError("NOT_FOUND", "Notification not found.", 404);
    }
    return prisma.userNotification.update({
      where: { id: notificationId },
      data: {
        status,
        readAt: status === "READ" ? new Date() : status === "UNREAD" ? null : undefined,
        archivedAt: status === "ARCHIVED" ? new Date() : null,
      },
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
  userId: string,
  input: ListNotificationsInput,
) => notificationService.list(userId, input);

export const markNotificationRead = (
  userId: string,
  notificationId: string,
) => notificationService.markRead(userId, notificationId);

export const markAllNotificationsRead = (userId: string) =>
  notificationService.markAllRead(userId);

export const archiveNotification = (
  userId: string,
  notificationId: string,
) => notificationService.archive(userId, notificationId);

export const getUnreadNotificationCount = (userId: string) =>
  notificationService.unreadCount(userId);

export const setNotificationStatus = (
  userId: string,
  notificationId: string,
  status: "UNREAD" | "READ" | "ARCHIVED",
) => notificationService.setStatus(userId, notificationId, status);
