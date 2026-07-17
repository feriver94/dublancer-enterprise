import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

type PreferenceInput = {
  category: string;
  channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS";
  enabled: boolean;
  quietHours?: Record<string, unknown>;
  locale?: "en-AE" | "ar-AE";
};

export class NotificationPreferenceService {
  async list(userId: string, organizationId?: string) {
    return prisma.notificationPreference.findMany({
      where: {
        userId,
        OR: [
          { organizationId: organizationId ?? null },
          { organizationId: null },
        ],
      },
      orderBy: [{ category: "asc" }, { channel: "asc" }],
    });
  }

  async upsert(
    userId: string,
    organizationId: string | undefined,
    input: PreferenceInput,
  ) {
    const existing =
      await prisma.notificationPreference.findFirst({
        where: {
          userId,
          organizationId: organizationId ?? null,
          category: input.category,
          channel: input.channel,
        },
        select: { id: true },
      });

    if (existing) {
      return prisma.notificationPreference.update({
        where: { id: existing.id },
        data: {
          enabled: input.enabled,
          quietHours: input.quietHours as Prisma.InputJsonValue | undefined,
          locale: input.locale,
        },
      });
    }

    return prisma.notificationPreference.create({
      data: {
        userId,
        organizationId,
        category: input.category,
        channel: input.channel,
        enabled: input.enabled,
        quietHours: input.quietHours as Prisma.InputJsonValue | undefined,
        locale: input.locale,
      },
    });
  }
}
