import { prisma } from "@/lib/database/prisma";
import { notificationProvider } from "@/lib/providers/integrations";

const MAX_ATTEMPTS = 8;

export async function processNotificationDeliveries(
  batchSize = 100,
) {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      status: "PENDING",
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: new Date() },
    },
    include: {
      notification: true,
      user: {
        select: {
          email: true,
          preferredLocale: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const results = [];

  for (const delivery of deliveries) {
    try {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "PROCESSING" },
      });

      let providerReference: string | undefined;
      if (delivery.channel !== "IN_APP") {
        const result = await notificationProvider.deliver({
          channel: delivery.channel,
          recipient: delivery.channel === "EMAIL" ? delivery.user.email : delivery.user.email,
          title: delivery.notification.title,
          body: delivery.notification.body ?? "",
          actionUrl: delivery.notification.actionUrl,
          idempotencyKey: delivery.id,
          locale: delivery.user.preferredLocale,
        });
        providerReference = result.providerReference;
      }

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          provider: delivery.channel === "IN_APP" ? "dublancer" : notificationProvider.key,
          providerRef: providerReference,
        },
      });

      results.push({ id: delivery.id, delivered: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown delivery error";

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status:
            delivery.attempts + 1 >= MAX_ATTEMPTS
              ? "FAILED"
              : "PENDING",
          attempts: { increment: 1 },
          availableAt: new Date(
            Date.now() +
              Math.min(2 ** delivery.attempts * 60_000, 3_600_000),
          ),
          lastError: message.slice(0, 2000),
        },
      });

      results.push({ id: delivery.id, delivered: false });
    }
  }

  return results;
}
