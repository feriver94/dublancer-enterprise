import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { enqueuePhase4Job, PHASE4_JOB_TYPES, runClaimedPhase4Job } from "@/lib/jobs/phase4-job.service";
import type { TenantContext } from "@/lib/tenancy/context";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const ENTITY_TYPES = ["PROJECT", "LISTING", "CONTRACT", "FILE"] as const;
type SearchEntityType = (typeof ENTITY_TYPES)[number];

type SearchRow = {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  locale: string;
  projectId: string | null;
  fileNodeId: string | null;
  metadata: unknown;
  indexedAt: Date;
  rank: number;
  highlight: string;
};

function sourceBody(parts: Array<unknown>) {
  return parts.filter((part) => part !== null && part !== undefined && String(part).trim()).map(String).join("\n");
}

function cursorEncode(row: { rank: number; indexedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ rank: Number(row.rank), indexedAt: row.indexedAt.toISOString(), id: row.id })).toString("base64url");
}

function cursorDecode(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as { rank?: number; indexedAt?: string; id?: string };
    const indexedAt = new Date(parsed.indexedAt ?? "");
    if (!Number.isFinite(parsed.rank) || !parsed.id || !Number.isFinite(indexedAt.getTime())) throw new Error("invalid");
    return { rank: Number(parsed.rank), indexedAt, id: parsed.id };
  } catch {
    throw new AppError("VALIDATION_ERROR", "Search cursor is invalid.", 422);
  }
}

export class SearchIndexService {
  private async upsertEntity(organizationId: string, entityType: SearchEntityType, entityId: string, generation?: string) {
    if (entityType === "FILE") {
      const file = await prisma.fileNode.findFirst({
        where: { id: entityId, organizationId, type: "FILE", deletedAt: null },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      const version = file?.versions[0];
      if (!file || !version || version.scanStatus !== "CLEAN") return this.deleteEntity(organizationId, entityType, entityId);
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: {
          organizationId,
          entityType,
          entityId,
          title: file.name,
          body: sourceBody([file.name, version.mimeType, JSON.stringify(file.metadata ?? {})]),
          locale: "en-AE",
          projectId: file.projectId,
          fileNodeId: file.id,
          requiredPermission: "files.read",
          sourceUpdatedAt: file.updatedAt > version.createdAt ? file.updatedAt : version.createdAt,
          generation,
          metadata: json({ type: file.type, version: version.version, scanStatus: version.scanStatus, sizeBytes: version.sizeBytes.toString(), href: `/files?fileId=${file.id}` }),
        },
        update: {
          title: file.name,
          body: sourceBody([file.name, version.mimeType, JSON.stringify(file.metadata ?? {})]),
          projectId: file.projectId,
          fileNodeId: file.id,
          requiredPermission: "files.read",
          sourceUpdatedAt: file.updatedAt > version.createdAt ? file.updatedAt : version.createdAt,
          indexedAt: new Date(),
          deletedAt: null,
          generation,
          metadata: json({ type: file.type, version: version.version, scanStatus: version.scanStatus, sizeBytes: version.sizeBytes.toString(), href: `/files?fileId=${file.id}` }),
        },
      });
    }

    if (entityType === "PROJECT") {
      const project = await prisma.project.findFirst({ where: { id: entityId, organizationId } });
      if (!project) return this.deleteEntity(organizationId, entityType, entityId);
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, title: project.title, body: sourceBody([project.description, project.status, project.slug]), projectId: project.id, requiredPermission: "project.read", sourceUpdatedAt: project.updatedAt, generation, metadata: json({ status: project.status, href: `/workspace/${project.id}` }) },
        update: { title: project.title, body: sourceBody([project.description, project.status, project.slug]), projectId: project.id, requiredPermission: "project.read", sourceUpdatedAt: project.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: project.status, href: `/workspace/${project.id}` }) },
      });
    }

    if (entityType === "LISTING") {
      const listing = await prisma.marketplaceListing.findFirst({ where: { id: entityId, organizationId, status: { not: "CANCELLED" } } });
      if (!listing) return this.deleteEntity(organizationId, entityType, entityId);
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, title: listing.title, body: sourceBody([listing.description, listing.status, listing.engagementType, listing.experienceLevel]), requiredPermission: "marketplace.listing.read", sourceUpdatedAt: listing.updatedAt, generation, metadata: json({ status: listing.status, href: `/marketplace/project/${listing.id}` }) },
        update: { title: listing.title, body: sourceBody([listing.description, listing.status, listing.engagementType, listing.experienceLevel]), projectId: null, fileNodeId: null, requiredPermission: "marketplace.listing.read", sourceUpdatedAt: listing.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: listing.status, href: `/marketplace/project/${listing.id}` }) },
      });
    }

    const contract = await prisma.contract.findFirst({ where: { id: entityId, OR: [{ organizationId }, { providerOrganizationId: organizationId }] } });
    if (!contract) return this.deleteEntity(organizationId, entityType, entityId);
    return prisma.searchDocument.upsert({
      where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
      create: { organizationId, entityType, entityId, title: contract.title, body: sourceBody([contract.status, contract.currency, contract.valueMinor.toString()]), requiredPermission: "marketplace.contract.manage", sourceUpdatedAt: contract.updatedAt, generation, metadata: json({ status: contract.status, href: `/contracts/${contract.id}` }) },
      update: { title: contract.title, body: sourceBody([contract.status, contract.currency, contract.valueMinor.toString()]), projectId: null, fileNodeId: null, requiredPermission: "marketplace.contract.manage", sourceUpdatedAt: contract.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: contract.status, href: `/contracts/${contract.id}` }) },
    });
  }

  private async deleteEntity(organizationId: string, entityType: SearchEntityType, entityId: string) {
    await prisma.searchDocument.deleteMany({ where: { organizationId, entityType, entityId } });
    return null;
  }

  private async indexBatch(organizationId: string, entityType: SearchEntityType, ids: string[], generation?: string) {
    for (const id of ids) await this.upsertEntity(organizationId, entityType, id, generation);
  }

  private async fullReindex(organizationId: string) {
    const generation = randomUUID();
    const startedAt = new Date();
    await prisma.searchIndexCheckpoint.upsert({
      where: { organizationId },
      create: { organizationId, status: "RUNNING", lastError: null },
      update: { status: "RUNNING", lastError: null },
    });
    try {
      const sources: Array<[SearchEntityType, () => Promise<string[]>]> = [
        ["PROJECT", async () => (await prisma.project.findMany({ where: { organizationId }, select: { id: true } })).map((row) => row.id)],
        ["LISTING", async () => (await prisma.marketplaceListing.findMany({ where: { organizationId, status: { not: "CANCELLED" } }, select: { id: true } })).map((row) => row.id)],
        ["CONTRACT", async () => (await prisma.contract.findMany({ where: { OR: [{ organizationId }, { providerOrganizationId: organizationId }] }, select: { id: true } })).map((row) => row.id)],
        ["FILE", async () => (await prisma.fileNode.findMany({ where: { organizationId, type: "FILE", deletedAt: null }, select: { id: true } })).map((row) => row.id)],
      ];
      for (const [entityType, loadIds] of sources) await this.indexBatch(organizationId, entityType, await loadIds(), generation);
      await prisma.searchDocument.deleteMany({ where: { organizationId, entityType: { in: [...ENTITY_TYPES] }, OR: [{ generation: null }, { generation: { not: generation } }] } });
      const documentCount = await prisma.searchDocument.count({ where: { organizationId, deletedAt: null } });
      await prisma.$transaction([
        prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "IDLE", lastFullReindexAt: startedAt, lastIncrementalAt: startedAt, lastIndexedAt: new Date(), documentCount, lastError: null } }),
        prisma.realtimeEvent.create({ data: { organizationId, topic: `organization:${organizationId}`, eventType: "search.index.updated", aggregateType: "SearchIndexCheckpoint", aggregateId: organizationId, payload: json({ mode: "FULL", documentCount }) } }),
      ]);
      return { generation, documentCount };
    } catch (error) {
      await prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown indexing error" } });
      throw error;
    }
  }

  private async incremental(organizationId: string) {
    const checkpoint = await prisma.searchIndexCheckpoint.findUnique({ where: { organizationId } });
    const until = new Date();
    const since = checkpoint?.lastIncrementalAt ? new Date(checkpoint.lastIncrementalAt.getTime() - 1_000) : new Date(0);
    await prisma.searchIndexCheckpoint.upsert({ where: { organizationId }, create: { organizationId, status: "RUNNING" }, update: { status: "RUNNING", lastError: null } });
    try {
      const [projects, listings, contracts, files] = await Promise.all([
        prisma.project.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.marketplaceListing.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.contract.findMany({ where: { OR: [{ organizationId }, { providerOrganizationId: organizationId }], updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.fileNode.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
      ]);
      await this.indexBatch(organizationId, "PROJECT", projects.map((row) => row.id));
      await this.indexBatch(organizationId, "LISTING", listings.map((row) => row.id));
      await this.indexBatch(organizationId, "CONTRACT", contracts.map((row) => row.id));
      await this.indexBatch(organizationId, "FILE", files.map((row) => row.id));
      const documentCount = await prisma.searchDocument.count({ where: { organizationId, deletedAt: null } });
      await prisma.$transaction([
        prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "IDLE", lastIncrementalAt: until, lastIndexedAt: new Date(), documentCount, lastError: null } }),
        prisma.realtimeEvent.create({ data: { organizationId, topic: `organization:${organizationId}`, eventType: "search.index.updated", aggregateType: "SearchIndexCheckpoint", aggregateId: organizationId, payload: json({ mode: "INCREMENTAL", documentCount }) } }),
      ]);
      return { indexed: projects.length + listings.length + contracts.length + files.length, documentCount };
    } catch (error) {
      await prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown indexing error" } });
      throw error;
    }
  }

  async enqueueReindex(context: TenantContext, idempotencyKey: string) {
    await requirePermission(context, "platform.operations.read");
    const job = await enqueuePhase4Job({ organizationId: context.organizationId, type: PHASE4_JOB_TYPES.SEARCH_REINDEX, payload: { organizationId: context.organizationId }, deduplicationKey: `search:reindex:${context.organizationId}:${idempotencyKey}` });
    return { job, checkpoint: await this.status(context) };
  }

  async scheduleIncremental(organizationId?: string) {
    const organizations = organizationId ? [{ id: organizationId }] : await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const minute = new Date().toISOString().slice(0, 16);
    return Promise.all(organizations.map((organization) => enqueuePhase4Job({ organizationId: organization.id, type: PHASE4_JOB_TYPES.SEARCH_INCREMENTAL, payload: { organizationId: organization.id }, deduplicationKey: `search:incremental:${organization.id}:${minute}` })));
  }

  async processNext(workerId: string) {
    return runClaimedPhase4Job(workerId, [PHASE4_JOB_TYPES.SEARCH_ENTITY, PHASE4_JOB_TYPES.SEARCH_REINDEX, PHASE4_JOB_TYPES.SEARCH_INCREMENTAL], async (job) => {
      const payload = job.payload as { organizationId?: string; entityType?: SearchEntityType; entityId?: string; action?: "UPSERT" | "DELETE" };
      const organizationId = job.organizationId ?? payload.organizationId;
      if (!organizationId) throw new AppError("VALIDATION_ERROR", "Search job organization is missing.", 422);
      if (job.type === PHASE4_JOB_TYPES.SEARCH_REINDEX) return this.fullReindex(organizationId);
      if (job.type === PHASE4_JOB_TYPES.SEARCH_INCREMENTAL) return this.incremental(organizationId);
      if (!payload.entityType || !ENTITY_TYPES.includes(payload.entityType) || !payload.entityId) throw new AppError("VALIDATION_ERROR", "Search entity job payload is invalid.", 422);
      return payload.action === "DELETE" ? this.deleteEntity(organizationId, payload.entityType, payload.entityId) : this.upsertEntity(organizationId, payload.entityType, payload.entityId);
    });
  }

  async status(context: TenantContext) {
    await requirePermission(context, "search.use");
    const [checkpoint, pendingJobs] = await Promise.all([
      prisma.searchIndexCheckpoint.findUnique({ where: { organizationId: context.organizationId } }),
      prisma.backgroundJob.count({ where: { organizationId: context.organizationId, type: { in: [PHASE4_JOB_TYPES.SEARCH_ENTITY, PHASE4_JOB_TYPES.SEARCH_REINDEX, PHASE4_JOB_TYPES.SEARCH_INCREMENTAL] }, status: { in: ["PENDING", "PROCESSING"] } } }),
    ]);
    return { checkpoint, pendingJobs };
  }

  async search(context: TenantContext, input: { q: string; entityType?: string; projectId?: string; locale?: string; cursor?: string; take: number }) {
    await requirePermission(context, "search.use");
    const authorization = await resolveAuthorization(context);
    const cursor = cursorDecode(input.cursor);
    const permissions = authorization.isPlatformAdmin ? [] : authorization.permissions;
    const [projects, files] = authorization.isPlatformAdmin ? [[], []] : await Promise.all([
      prisma.project.findMany({ where: { organizationId: context.organizationId, OR: [{ ownerId: context.userId }, { memberships: { some: { userId: context.userId } } }] }, select: { id: true } }),
      prisma.fileNode.findMany({ where: { organizationId: context.organizationId, deletedAt: null, OR: [{ inheritedPermissions: true }, { createdById: context.userId }, { accessGrants: { some: { AND: [{ OR: [{ subjectUserId: context.userId }, ...(authorization.roleId ? [{ subjectRoleId: authorization.roleId }] : [])] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] } } }] }, select: { id: true } }),
    ]);
    const projectIds = projects.map((row) => row.id);
    const fileIds = files.map((row) => row.id);
    const permissionClause = authorization.isPlatformAdmin
      ? Prisma.sql`TRUE`
      : permissions.length
        ? Prisma.sql`("requiredPermission" IS NULL OR "requiredPermission" IN (${Prisma.join(permissions)}))`
        : Prisma.sql`"requiredPermission" IS NULL`;
    const projectClause = authorization.isPlatformAdmin
      ? Prisma.sql`TRUE`
      : projectIds.length
        ? Prisma.sql`("projectId" IS NULL OR "projectId" IN (${Prisma.join(projectIds)}))`
        : Prisma.sql`"projectId" IS NULL`;
    const fileClause = authorization.isPlatformAdmin
      ? Prisma.sql`TRUE`
      : fileIds.length
        ? Prisma.sql`("fileNodeId" IS NULL OR "fileNodeId" IN (${Prisma.join(fileIds)}))`
        : Prisma.sql`"fileNodeId" IS NULL`;
    const entityClause = input.entityType && input.entityType !== "all" ? Prisma.sql`AND "entityType" = ${input.entityType.toUpperCase()}` : Prisma.empty;
    const localeClause = input.locale ? Prisma.sql`AND "locale" = ${input.locale}` : Prisma.empty;
    const projectFilterClause = input.projectId ? Prisma.sql`AND "projectId" = ${input.projectId}` : Prisma.empty;
    const cursorClause = cursor ? Prisma.sql`AND (rank < ${cursor.rank} OR (rank = ${cursor.rank} AND ("indexedAt" < ${cursor.indexedAt} OR ("indexedAt" = ${cursor.indexedAt} AND "id" > ${cursor.id}))))` : Prisma.empty;
    const started = Date.now();
    const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH query AS (SELECT websearch_to_tsquery('simple', ${input.q}) AS value),
      ranked AS (
        SELECT "id", "entityType", "entityId", "title", "body", "locale", "projectId", "fileNodeId", "metadata", "indexedAt",
          ts_rank_cd("searchVector", query.value)::double precision AS rank,
          ts_headline('simple', "body", query.value, 'StartSel=[[[, StopSel=]]], MaxFragments=2, MaxWords=24, MinWords=8') AS highlight
        FROM "SearchDocument", query
        WHERE "organizationId" = ${context.organizationId}
          AND "deletedAt" IS NULL
          AND "searchVector" @@ query.value
          AND ${permissionClause}
          AND ${projectClause}
          AND ${fileClause}
          ${entityClause}
          ${localeClause}
          ${projectFilterClause}
      )
      SELECT * FROM ranked
      WHERE TRUE ${cursorClause}
      ORDER BY rank DESC, "indexedAt" DESC, "id" ASC
      LIMIT ${input.take + 1}
    `);
    const hasMore = rows.length > input.take;
    if (hasMore) rows.pop();
    const next = hasMore ? rows.at(-1) ?? null : null;
    await prisma.searchQueryLog.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        scope: input.entityType ?? "all",
        queryHash: createHash("sha256").update(input.q.toLocaleLowerCase()).digest("hex"),
        resultCount: rows.length,
        durationMs: Date.now() - started,
        filters: json({ entityType: input.entityType ?? "all", projectId: input.projectId ?? null, locale: input.locale ?? null }),
      },
    });
    return { items: rows, nextCursor: next ? cursorEncode(next) : null };
  }
}
