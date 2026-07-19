import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { REALTIME_EVENTS, REALTIME_TOPICS } from "@/lib/realtime/topics";
import type { TenantContext } from "@/lib/tenancy/context";

type PreferenceInput = {
  category: string;
  channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS";
  enabled: boolean;
  quietHours?: Record<string, unknown>;
  locale?: "en-AE" | "ar-AE";
};

export class NotificationPreferenceService {
  async list(context: TenantContext) {
    return prisma.notificationPreference.findMany({
      where: {
        userId: context.userId,
        OR: [
          { organizationId: context.organizationId },
          { organizationId: null },
        ],
      },
      orderBy: [{ category: "asc" }, { channel: "asc" }],
    });
  }

  async upsert(
    context: TenantContext,
    input: PreferenceInput,
  ) {
    const existing =
      await prisma.notificationPreference.findFirst({
        where: {
          userId: context.userId,
          organizationId: context.organizationId,
          category: input.category,
          channel: input.channel,
        },
        select: { id: true },
      });

    return prisma.$transaction(async (tx) => {
      const preference = existing
        ? await tx.notificationPreference.update({
            where: { id: existing.id },
            data: {
              enabled: input.enabled,
              quietHours: input.quietHours as Prisma.InputJsonValue | undefined,
              locale: input.locale,
            },
          })
        : await tx.notificationPreference.create({
            data: {
              userId: context.userId,
              organizationId: context.organizationId,
              category: input.category,
              channel: input.channel,
              enabled: input.enabled,
              quietHours: input.quietHours as Prisma.InputJsonValue | undefined,
              locale: input.locale,
            },
          });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "notification.preference.update",
          resourceType: "NotificationPreference",
          resourceId: preference.id,
          outcome: "SUCCESS",
          metadata: { category: preference.category, channel: preference.channel, enabled: preference.enabled },
        },
      });
      await tx.realtimeEvent.create({
        data: {
          organizationId: context.organizationId,
          topic: REALTIME_TOPICS.user(context.userId),
          eventType: REALTIME_EVENTS.NOTIFICATION_PREFERENCES_UPDATED,
          aggregateType: "NotificationPreference",
          aggregateId: preference.id,
          actorUserId: context.userId,
          payload: { category: preference.category, channel: preference.channel, enabled: preference.enabled },
        },
      });
      return preference;
    });
  }
}
