import { prisma } from "@/lib/database/prisma";
import { REALTIME_TOPICS } from "@/lib/realtime/topics";

export class ChatRetentionService {
  async purgeExpired(batchSize = 500) {
    const channels = await prisma.chatChannel.findMany({
      where: { retentionDays: { not: null } },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        retentionDays: true,
      },
      orderBy: { id: "asc" },
      take: 100,
    });

    let purged = 0;
    const results: Array<{ channelId: string; purged: number }> = [];

    for (const channel of channels) {
      if (!channel.retentionDays || purged >= batchSize) break;
      const cutoff = new Date(Date.now() - channel.retentionDays * 86_400_000);
      const remaining = batchSize - purged;

      const candidates = await prisma.chatMessage.findMany({
        where: {
          channelId: channel.id,
          createdAt: { lt: cutoff },
          OR: [
            { parentId: { not: null } },
            {
              parentId: null,
              replies: { none: { createdAt: { gte: cutoff } } },
            },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: remaining,
      });
      if (candidates.length === 0) continue;

      const deleted = await prisma.$transaction(async (tx) => {
        const result = await tx.chatMessage.deleteMany({
          where: { id: { in: candidates.map((message) => message.id) } },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: channel.organizationId,
            action: "chat.retention.purge",
            resourceType: "ChatChannel",
            resourceId: channel.id,
            outcome: "SUCCESS",
            metadata: {
              cutoff: cutoff.toISOString(),
              retentionDays: channel.retentionDays,
              deletedMessages: result.count,
            },
          },
        });
        await tx.realtimeEvent.create({
          data: {
            organizationId: channel.organizationId,
            projectId: channel.projectId,
            topic: REALTIME_TOPICS.chatChannel(channel.id),
            eventType: "chat.retention.purged",
            aggregateType: "ChatChannel",
            aggregateId: channel.id,
            payload: { channelId: channel.id, cutoff: cutoff.toISOString(), purged: result.count },
          },
        });
        return result.count;
      });
      purged += deleted;
      results.push({ channelId: channel.id, purged: deleted });
    }

    return { purged, channels: results, hasMore: purged >= batchSize };
  }
}
