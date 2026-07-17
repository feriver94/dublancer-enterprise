import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

export type RealtimeEventInput = {
  organizationId: string;
  projectId?: string;
  topic: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
};

export async function enqueueRealtimeEvent(
  input: RealtimeEventInput,
) {
  return prisma.realtimeEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      topic: input.topic,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorUserId: input.actorUserId,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}
