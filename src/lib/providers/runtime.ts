import { prisma } from "@/lib/database/prisma";

export interface QueueProvider { enqueue(input: { organizationId?: string; type: string; payload: unknown }): Promise<{ id: string }> }
export interface SearchProvider { search(input: { organizationId: string; query: string; take: number }): Promise<unknown[]> }
export interface CacheProvider { invalidate(topic: string): Promise<void> }

class PostgresQueueProvider implements QueueProvider {
  async enqueue(input: { organizationId?: string; type: string; payload: unknown }) {
    return prisma.backgroundJob.create({ data: { organizationId: input.organizationId, type: input.type, payload: JSON.parse(JSON.stringify(input.payload)) }, select: { id: true } });
  }
}

class PostgresSearchProvider implements SearchProvider {
  async search(input: { organizationId: string; query: string; take: number }) {
    return prisma.searchDocument.findMany({ where: { organizationId: input.organizationId, OR: [{ title: { contains: input.query, mode: "insensitive" } }, { body: { contains: input.query, mode: "insensitive" } }] }, orderBy: { indexedAt: "desc" }, take: input.take });
  }
}

class EventInvalidationProvider implements CacheProvider {
  async invalidate(_topic: string) { return; }
}

export const queueProvider: QueueProvider = new PostgresQueueProvider();
export const searchProvider: SearchProvider = new PostgresSearchProvider();
export const cacheProvider: CacheProvider = new EventInvalidationProvider();
