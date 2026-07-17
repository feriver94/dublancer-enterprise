import { prisma } from "@/lib/database/prisma";
import { redis } from "./redis";

const MAX_ATTEMPTS = 10;

export async function publishPendingRealtimeEvents(
  batchSize = 100,
) {
  const events = await prisma.realtimeEvent.findMany({
    where: {
      status: "PENDING",
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const results: Array<{
    id: string;
    published: boolean;
  }> = [];

  for (const event of events) {
    try {
      await redis.publish(
        event.topic,
        JSON.stringify({
          id: event.id,
          eventType: event.eventType,
          organizationId: event.organizationId,
          projectId: event.projectId,
          actorUserId: event.actorUserId,
          payload: event.payload,
          createdAt: event.createdAt.toISOString(),
        }),
      );

      await prisma.realtimeEvent.update({
        where: { id: event.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      });

      results.push({ id: event.id, published: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 2000)
          : "Unknown publish error";

      await prisma.realtimeEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: message,
          availableAt: new Date(Date.now() + 5000),
        },
      });

      results.push({ id: event.id, published: false });
    }
  }

  return results;
}
