import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { enqueuePhase4Job, PHASE4_JOB_TYPES, runClaimedPhase4Job } from "@/lib/jobs/phase4-job.service";
import type { TenantContext } from "@/lib/tenancy/context";
import { distributedCache } from "@/lib/cache/distributed-cache";
import { federatedSearch } from "@/lib/services/federated-search.service";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const ENTITY_TYPES = ["PROJECT", "TASK", "USER", "FILE", "CONTRACT", "ORGANIZATION", "LISTING"] as const;
type SearchEntityType = (typeof ENTITY_TYPES)[number];
const LIVE_ENTITY_TYPES = [...ENTITY_TYPES, "CLIENT_PROFILE", "FREELANCER_PROFILE", "PUBLIC_ORGANIZATION"] as const;

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
        create: { organizationId, entityType, entityId, title: project.title, body: sourceBody([project.description, project.status, project.slug]), projectId: project.id, requiredPermission: "project.read", sourceUpdatedAt: project.updatedAt, generation, metadata: json({ status: project.status, href: `/workspace/project/${project.id}` }) },
        update: { title: project.title, body: sourceBody([project.description, project.status, project.slug]), projectId: project.id, requiredPermission: "project.read", sourceUpdatedAt: project.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: project.status, href: `/workspace/project/${project.id}` }) },
      });
    }

    if (entityType === "TASK") {
      const task = await prisma.projectTask.findFirst({
        where: { id: entityId, project: { organizationId } },
        include: { project: { select: { id: true, title: true } }, assignee: { select: { displayName: true, email: true } } },
      });
      if (!task) return this.deleteEntity(organizationId, entityType, entityId);
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, title: task.title, body: sourceBody([task.description, task.status, task.priority, task.project.title, task.assignee?.displayName, task.assignee?.email]), projectId: task.projectId, requiredPermission: "project.read", sourceUpdatedAt: task.updatedAt, generation, metadata: json({ status: task.status, priority: task.priority, href: `/workspace/project/${task.projectId}?taskId=${task.id}` }) },
        update: { title: task.title, body: sourceBody([task.description, task.status, task.priority, task.project.title, task.assignee?.displayName, task.assignee?.email]), projectId: task.projectId, fileNodeId: null, requiredPermission: "project.read", sourceUpdatedAt: task.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: task.status, priority: task.priority, href: `/workspace/project/${task.projectId}?taskId=${task.id}` }) },
      });
    }

    if (entityType === "USER") {
      const membership = await prisma.membership.findFirst({
        where: { organizationId, userId: entityId, status: "ACTIVE" },
        include: { user: { select: { id: true, displayName: true, email: true, updatedAt: true } }, role: { select: { name: true } } },
      });
      if (!membership) return this.deleteEntity(organizationId, entityType, entityId);
      const updatedAt = membership.updatedAt > membership.user.updatedAt ? membership.updatedAt : membership.user.updatedAt;
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, title: membership.user.displayName || membership.user.email, body: sourceBody([membership.user.email, membership.role?.name, membership.status]), requiredPermission: "organization.members.read", sourceUpdatedAt: updatedAt, generation, metadata: json({ role: membership.role?.name ?? null, href: `/organization/members?userId=${membership.user.id}` }) },
        update: { title: membership.user.displayName || membership.user.email, body: sourceBody([membership.user.email, membership.role?.name, membership.status]), projectId: null, fileNodeId: null, requiredPermission: "organization.members.read", sourceUpdatedAt: updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ role: membership.role?.name ?? null, href: `/organization/members?userId=${membership.user.id}` }) },
      });
    }

    if (entityType === "ORGANIZATION") {
      const organization = await prisma.organization.findFirst({ where: { id: entityId, status: { not: "ARCHIVED" } } });
      if (!organization || organization.id !== organizationId) return this.deleteEntity(organizationId, entityType, entityId);
      return prisma.searchDocument.upsert({
        where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } },
        create: { organizationId, entityType, entityId, title: organization.name, body: sourceBody([organization.slug, organization.status]), requiredPermission: "organization.read", sourceUpdatedAt: organization.updatedAt, generation, metadata: json({ status: organization.status, href: "/enterprise" }) },
        update: { title: organization.name, body: sourceBody([organization.slug, organization.status]), projectId: null, fileNodeId: null, requiredPermission: "organization.read", sourceUpdatedAt: organization.updatedAt, indexedAt: new Date(), deletedAt: null, generation, metadata: json({ status: organization.status, href: "/enterprise" }) },
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
        ["TASK", async () => (await prisma.projectTask.findMany({ where: { project: { organizationId } }, select: { id: true } })).map((row) => row.id)],
        ["USER", async () => (await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true } })).map((row) => row.userId)],
        ["ORGANIZATION", async () => [organizationId]],
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
      await distributedCache.invalidateTenant(organizationId);
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
      const [projects, tasks, users, organizations, listings, contracts, files] = await Promise.all([
        prisma.project.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.projectTask.findMany({ where: { project: { organizationId }, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.user.findMany({ where: { memberships: { some: { organizationId, status: "ACTIVE" } }, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.organization.findMany({ where: { id: organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.marketplaceListing.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.contract.findMany({ where: { OR: [{ organizationId }, { providerOrganizationId: organizationId }], updatedAt: { gte: since, lte: until } }, select: { id: true } }),
        prisma.fileNode.findMany({ where: { organizationId, updatedAt: { gte: since, lte: until } }, select: { id: true } }),
      ]);
      await this.indexBatch(organizationId, "PROJECT", projects.map((row) => row.id));
      await this.indexBatch(organizationId, "TASK", tasks.map((row) => row.id));
      await this.indexBatch(organizationId, "USER", users.map((row) => row.id));
      await this.indexBatch(organizationId, "ORGANIZATION", organizations.map((row) => row.id));
      await this.indexBatch(organizationId, "LISTING", listings.map((row) => row.id));
      await this.indexBatch(organizationId, "CONTRACT", contracts.map((row) => row.id));
      await this.indexBatch(organizationId, "FILE", files.map((row) => row.id));
      const documentCount = await prisma.searchDocument.count({ where: { organizationId, deletedAt: null } });
      await prisma.$transaction([
        prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "IDLE", lastIncrementalAt: until, lastIndexedAt: new Date(), documentCount, lastError: null } }),
        prisma.realtimeEvent.create({ data: { organizationId, topic: `organization:${organizationId}`, eventType: "search.index.updated", aggregateType: "SearchIndexCheckpoint", aggregateId: organizationId, payload: json({ mode: "INCREMENTAL", documentCount }) } }),
      ]);
      await distributedCache.invalidateTenant(organizationId);
      return { indexed: projects.length + tasks.length + users.length + organizations.length + listings.length + contracts.length + files.length, documentCount };
    } catch (error) {
      await prisma.searchIndexCheckpoint.update({ where: { organizationId }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown indexing error" } });
      throw error;
    }
  }

  async synchronizeEntity(organizationId: string, entityType: SearchEntityType, entityId: string, action: "UPSERT" | "DELETE" = "UPSERT") {
    const result = action === "DELETE" ? await this.deleteEntity(organizationId, entityType, entityId) : await this.upsertEntity(organizationId, entityType, entityId);
    await distributedCache.invalidateTenant(organizationId);
    return result;
  }

  private async liveReadThrough(input: {
    organizationId: string; userId: string; q: string; entityType?: string; take: number;
    permissions: string[]; projectIds: string[]; fileIds: string[]; isPlatformAdmin: boolean;
  }): Promise<SearchRow[]> {
    const q = input.q.trim();
    const wants = (type: (typeof LIVE_ENTITY_TYPES)[number]) => !input.entityType || input.entityType === "all" || input.entityType.toUpperCase() === type;
    const can = (permission: string) => input.isPlatformAdmin || input.permissions.includes("*") || input.permissions.includes(permission);
    const now = new Date();
    const rank = (title: string, body: string) => {
      const needle = q.toLocaleLowerCase();
      const heading = title.toLocaleLowerCase();
      if (heading === needle) return 1;
      if (heading.startsWith(needle)) return 0.9;
      if (heading.includes(needle)) return 0.75;
      return body.toLocaleLowerCase().includes(needle) ? 0.5 : 0;
    };
    const highlight = (title: string, body: string) => {
      const source = body.toLocaleLowerCase().includes(q.toLocaleLowerCase()) ? body : title;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return source.replace(new RegExp(escaped, "i"), (match) => `[[[${match}]]]`);
    };
    const row = (type: string, entityId: string, title: string, body: string, updatedAt: Date, metadata: Record<string, unknown>, projectId: string | null = null, fileNodeId: string | null = null): SearchRow => ({
      id: `live-${type.toLocaleLowerCase()}-${entityId}`, entityType: type, entityId, title, body, locale: "en-AE", projectId, fileNodeId, metadata, indexedAt: updatedAt ?? now, rank: rank(title, body), highlight: highlight(title, body),
    });

    const [projects, tasks, users, files, contracts, organizations, listings, clients, freelancers, publicOrganizations] = await Promise.all([
      wants("PROJECT") && can("project.read") ? prisma.project.findMany({ where: { organizationId: input.organizationId, id: { in: input.projectIds }, status: { not: "CANCELLED" }, OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }, select: { id: true, title: true, description: true, slug: true, status: true, updatedAt: true }, take: input.take }) : [],
      wants("TASK") && can("project.read") ? prisma.projectTask.findMany({ where: { projectId: { in: input.projectIds }, status: { not: "CANCELLED" }, OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, select: { id: true, title: true, description: true, status: true, priority: true, projectId: true, updatedAt: true }, take: input.take }) : [],
      wants("USER") && can("organization.members.read") ? prisma.membership.findMany({ where: { organizationId: input.organizationId, status: "ACTIVE", user: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } }, select: { user: { select: { id: true, displayName: true, username: true, updatedAt: true } }, role: { select: { name: true } }, updatedAt: true }, take: input.take }) : [],
      wants("FILE") && can("files.read") ? prisma.fileNode.findMany({ where: { organizationId: input.organizationId, id: { in: input.fileIds }, type: "FILE", deletedAt: null, name: { contains: q, mode: "insensitive" }, versions: { some: { scanStatus: "CLEAN" } } }, select: { id: true, name: true, projectId: true, updatedAt: true, versions: { where: { scanStatus: "CLEAN" }, select: { mimeType: true }, orderBy: { version: "desc" }, take: 1 } }, take: input.take }) : [],
      wants("CONTRACT") && can("marketplace.contract.manage") ? prisma.contract.findMany({ where: { OR: [{ organizationId: input.organizationId }, { providerOrganizationId: input.organizationId }, { providerUserId: input.userId }], title: { contains: q, mode: "insensitive" } }, select: { id: true, title: true, status: true, currency: true, updatedAt: true }, take: input.take }) : [],
      wants("ORGANIZATION") && can("organization.read") ? prisma.organization.findMany({ where: { id: input.organizationId, status: { not: "ARCHIVED" }, OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }, select: { id: true, name: true, slug: true, status: true, updatedAt: true }, take: input.take }) : [],
      wants("LISTING") && can("marketplace.listing.read") ? prisma.marketplaceListing.findMany({ where: { status: { notIn: ["CANCELLED", "CLOSED"] }, OR: [{ organizationId: input.organizationId }, { status: "PUBLISHED", visibility: "PUBLIC" }], AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] }, select: { id: true, title: true, description: true, status: true, updatedAt: true }, take: input.take }) : [],
      wants("CLIENT_PROFILE") ? prisma.clientProfile.findMany({ where: { deletedAt: null, visibility: { in: ["PUBLIC", "VERIFIED"] }, persona: { status: "ACTIVE" }, OR: [{ displayName: { contains: q, mode: "insensitive" } }, { headline: { contains: q, mode: "insensitive" } }, { about: { contains: q, mode: "insensitive" } }] }, select: { id: true, displayName: true, headline: true, about: true, updatedAt: true, user: { select: { username: true } } }, take: input.take }) : [],
      wants("FREELANCER_PROFILE") ? prisma.freelancerProfile.findMany({ where: { deletedAt: null, isPublic: true, visibility: { in: ["PUBLIC", "VERIFIED"] }, persona: { status: "ACTIVE" }, OR: [{ headline: { contains: q, mode: "insensitive" } }, { bio: { contains: q, mode: "insensitive" } }, { searchText: { contains: q, mode: "insensitive" } }] }, select: { id: true, headline: true, bio: true, services: true, updatedAt: true, user: { select: { username: true } } }, take: input.take }) : [],
      wants("PUBLIC_ORGANIZATION") ? prisma.organization.findMany({ where: { status: "ACTIVE", companyProfile: { deletedAt: null, visibility: { in: ["PUBLIC", "VERIFIED"] }, OR: [{ legalName: { contains: q, mode: "insensitive" } }, { tradingName: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } }, select: { id: true, name: true, slug: true, updatedAt: true, companyProfile: { select: { legalName: true, tradingName: true, description: true } } }, take: input.take }) : [],
    ]);

    const live = [
      ...projects.map((item) => row("PROJECT", item.id, item.title, sourceBody([item.description, item.slug, item.status]), item.updatedAt, { status: item.status, href: `/workspace/project/${item.id}` }, item.id)),
      ...tasks.map((item) => row("TASK", item.id, item.title, sourceBody([item.description, item.status, item.priority]), item.updatedAt, { status: item.status, href: `/workspace/project/${item.projectId}?taskId=${item.id}` }, item.projectId)),
      ...users.map((item) => row("USER", item.user.id, item.user.displayName || item.user.username || "Member", sourceBody([item.user.username, item.role?.name]), item.updatedAt > item.user.updatedAt ? item.updatedAt : item.user.updatedAt, { role: item.role?.name ?? null, href: `/organization/members?userId=${item.user.id}` })),
      ...files.map((item) => row("FILE", item.id, item.name, sourceBody([item.versions[0]?.mimeType]), item.updatedAt, { href: `/files?fileId=${item.id}` }, item.projectId, item.id)),
      ...contracts.map((item) => row("CONTRACT", item.id, item.title, sourceBody([item.status, item.currency]), item.updatedAt, { status: item.status, href: `/contracts/${item.id}` })),
      ...organizations.map((item) => row("ORGANIZATION", item.id, item.name, sourceBody([item.slug, item.status]), item.updatedAt, { status: item.status, href: "/enterprise" })),
      ...listings.map((item) => row("LISTING", item.id, item.title, sourceBody([item.description, item.status]), item.updatedAt, { status: item.status, href: `/marketplace/project/${item.id}` })),
      ...clients.map((item) => row("CLIENT_PROFILE", item.id, item.displayName, sourceBody([item.headline, item.about]), item.updatedAt, { href: `/u/${item.user.username}/client`, public: true })),
      ...freelancers.map((item) => row("FREELANCER_PROFILE", item.id, item.headline, sourceBody([item.bio, ...item.services]), item.updatedAt, { href: `/u/${item.user.username}/freelancer`, public: true })),
      ...publicOrganizations.map((item) => row("PUBLIC_ORGANIZATION", item.id, item.companyProfile?.tradingName ?? item.name, sourceBody([item.companyProfile?.legalName, item.companyProfile?.description]), item.updatedAt, { href: `/org/${item.slug}`, public: true })),
    ];
    return live.filter((item) => item.rank > 0).sort((left, right) => right.rank - left.rank || right.indexedAt.getTime() - left.indexedAt.getTime()).slice(0, input.take);
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
    const cacheKey = `search:${distributedCache.key({
      userId: context.userId,
      permissions,
      projectIds,
      fileIds,
      input,
    })}`;
    const cached = await distributedCache.getOrSet(
      context.organizationId,
      cacheKey,
      30,
      async () => {
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
        const remaining = input.cursor ? 0 : Math.max(0, input.take - rows.length);
        const federated = remaining
          ? await federatedSearch({
              organizationId: context.organizationId,
              query: input.q,
              entityType: input.entityType,
              locale: input.locale,
              take: remaining,
              permissions,
              projectIds,
              fileIds,
              isPlatformAdmin: authorization.isPlatformAdmin,
            })
          : [];
        return {
          items: [...rows, ...federated],
          nextCursor: next ? cursorEncode(next) : null,
        };
      },
    );
    const live = input.cursor ? [] : await this.liveReadThrough({
      organizationId: context.organizationId,
      userId: context.userId,
      q: input.q,
      entityType: input.entityType,
      take: input.take,
      permissions,
      projectIds,
      fileIds,
      isPlatformAdmin: authorization.isPlatformAdmin,
    });
    const liveTypes = new Set(LIVE_ENTITY_TYPES);
    const supplemental = input.cursor
      ? cached.value.items
      : cached.value.items.filter((item) =>
          item.id.startsWith("federated-") ||
          !liveTypes.has(item.entityType as (typeof LIVE_ENTITY_TYPES)[number]),
        );
    const unique = new Map<string, SearchRow>();
    for (const item of [...live, ...supplemental]) unique.set(`${item.entityType}:${item.entityId}`, item);
    const items = [...unique.values()].sort((left, right) => right.rank - left.rank || right.indexedAt.getTime() - left.indexedAt.getTime()).slice(0, input.take);
    const result = { items, nextCursor: cached.value.nextCursor };
    await prisma.searchQueryLog.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        scope: input.entityType ?? "all",
        queryHash: createHash("sha256").update(input.q.toLocaleLowerCase()).digest("hex"),
        resultCount: result.items.length,
        durationMs: Date.now() - started,
        filters: json({ entityType: input.entityType ?? "all", projectId: input.projectId ?? null, locale: input.locale ?? null, cache: cached.cache, consistency: "AUTHORITATIVE_LIVE_READ_THROUGH" }),
      },
    });
    return result;
  }
}
