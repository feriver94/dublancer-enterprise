import { createHash, randomBytes } from "node:crypto";
import { Prisma, type FileAccessLevel, type FileNode } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { fileScanProvider, storageProvider } from "@/lib/providers/integrations";
import { PHASE4_JOB_TYPES } from "@/lib/jobs/phase4-job.service";
import type { TenantContext } from "@/lib/tenancy/context";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const accessRank: Record<FileAccessLevel, number> = { VIEW: 1, DOWNLOAD: 2, EDIT: 3, MANAGE: 4 };

type Authorization = Awaited<ReturnType<typeof resolveAuthorization>>;

function accessibleFileWhere(context: TenantContext, authorization: Authorization, minimum: FileAccessLevel): Prisma.FileNodeWhereInput {
  if (authorization.isPlatformAdmin) return {};
  const allowed = (Object.entries(accessRank) as Array<[FileAccessLevel, number]>)
    .filter(([, rank]) => rank >= accessRank[minimum])
    .map(([access]) => access);
  return {
    OR: [
      { inheritedPermissions: true },
      { createdById: context.userId },
      {
        accessGrants: {
          some: {
            access: { in: allowed },
            AND: [
              {
                OR: [
                  { subjectUserId: context.userId },
                  ...(authorization.roleId ? [{ subjectRoleId: authorization.roleId }] : []),
                ],
              },
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
        },
      },
    ],
  };
}

async function assertProjectAccess(context: TenantContext, projectId?: string | null) {
  if (!projectId) return;
  await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"]);
}

async function authorizationFor(context: TenantContext, permission: "files.read" | "files.manage") {
  await requirePermission(context, permission);
  return resolveAuthorization(context);
}

function fileEvent(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  node: { id: string; projectId: string | null },
  eventType: string,
  payload: unknown,
) {
  return tx.realtimeEvent.create({
    data: {
      organizationId: context.organizationId,
      projectId: node.projectId,
      actorUserId: context.userId,
      topic: node.projectId ? `project:${node.projectId}` : `organization:${context.organizationId}`,
      eventType,
      aggregateType: "FileNode",
      aggregateId: node.id,
      payload: json(payload),
    },
  });
}

function fileAudit(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  action: string,
  resourceId: string,
  metadata?: unknown,
) {
  return tx.auditEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      resourceType: "FileNode",
      resourceId,
      outcome: "SUCCESS",
      metadata: metadata === undefined ? undefined : json(metadata),
    },
  });
}

function queueFileIndex(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fileNodeId: string,
  sourceUpdatedAt: Date,
  action: "UPSERT" | "DELETE",
) {
  const stamp = sourceUpdatedAt.toISOString();
  return tx.backgroundJob.upsert({
    where: { deduplicationKey: `search:file:${fileNodeId}:${action}:${stamp}` },
    create: {
      organizationId,
      type: PHASE4_JOB_TYPES.SEARCH_ENTITY,
      deduplicationKey: `search:file:${fileNodeId}:${action}:${stamp}`,
      payload: json({ entityType: "FILE", entityId: fileNodeId, action }),
    },
    update: {},
  });
}

function parseExpiry(value: string) {
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new AppError("SERVICE_UNAVAILABLE", "Storage provider returned an invalid upload expiry.", 503);
  }
  return expiresAt;
}

function uploadStorageKey(organizationId: string) {
  return `${organizationId}/${new Date().toISOString().slice(0, 10)}/${randomBytes(18).toString("hex")}`;
}

function normalizeChecksum(value: string) {
  return value.toLowerCase();
}

export class EnterpriseFileProductService {
  private async file(context: TenantContext, id: string, minimum: FileAccessLevel, includeDeleted = true) {
    const permission = accessRank[minimum] >= accessRank.EDIT ? "files.manage" : "files.read";
    const authorization = await authorizationFor(context, permission);
    const row = await prisma.fileNode.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...accessibleFileWhere(context, authorization, minimum),
      },
      include: {
        versions: { orderBy: { version: "desc" } },
        lock: { include: { lockedBy: { select: { id: true, displayName: true } } } },
        accessGrants: true,
        activities: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!row) throw new AppError("NOT_FOUND", "File or folder not found.", 404);
    await assertProjectAccess(context, row.projectId);
    return row;
  }

  private requireLockOwnership(
    context: TenantContext,
    lock: { lockedById: string; tokenHash: string; expiresAt: Date } | null,
    token?: string,
  ) {
    if (!lock || lock.expiresAt <= new Date()) return;
    const tokenHash = token ? createHash("sha256").update(token).digest("hex") : "";
    if (lock.lockedById !== context.userId || tokenHash !== lock.tokenHash) {
      throw new AppError("CONFLICT", "The file is locked by another session.", 409);
    }
  }

  async list(context: TenantContext, input: {
    cursor?: string;
    take: number;
    projectId?: string;
    parentId?: string | null;
    query?: string;
    deleted: "active" | "only" | "all";
  }) {
    const authorization = await authorizationFor(context, "files.read");
    await assertProjectAccess(context, input.projectId);
    if (input.parentId) await this.file(context, input.parentId, "VIEW", false);
    const rows = await prisma.fileNode.findMany({
      where: {
        organizationId: context.organizationId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.query ? { name: { contains: input.query, mode: "insensitive" } } : {}),
        ...(input.deleted === "active" ? { deletedAt: null } : input.deleted === "only" ? { deletedAt: { not: null } } : {}),
        ...accessibleFileWhere(context, authorization, "VIEW"),
      },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        lock: { include: { lockedBy: { select: { id: true, displayName: true } } } },
        _count: { select: { children: true } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > input.take;
    if (hasMore) rows.pop();
    const nextCursor = hasMore ? rows.at(-1)?.id ?? null : null;
    const breadcrumbs: Array<{ id: string; name: string }> = [];
    let parentId = input.parentId ?? null;
    for (let depth = 0; parentId && depth < 64; depth += 1) {
      const parent = await prisma.fileNode.findFirst({
        where: { id: parentId, organizationId: context.organizationId, ...accessibleFileWhere(context, authorization, "VIEW") },
        select: { id: true, name: true, parentId: true },
      });
      if (!parent) break;
      breadcrumbs.unshift({ id: parent.id, name: parent.name });
      parentId = parent.parentId;
    }
    return { items: rows, nextCursor, breadcrumbs };
  }

  async get(context: TenantContext, id: string) {
    return this.file(context, id, "VIEW");
  }

  async createFolder(context: TenantContext, input: { name: string; parentId?: string; projectId?: string; metadata?: Record<string, unknown> }) {
    const authorization = await authorizationFor(context, "files.manage");
    await assertProjectAccess(context, input.projectId);
    if (input.parentId) {
      const parent = await this.file(context, input.parentId, "EDIT", false);
      if (parent.type !== "FOLDER") throw new AppError("CONFLICT", "The selected parent is not a folder.", 409);
      if ((parent.projectId ?? null) !== (input.projectId ?? null)) throw new AppError("CONFLICT", "Folder and parent must belong to the same project scope.", 409);
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const node = await tx.fileNode.create({
          data: {
            organizationId: context.organizationId,
            projectId: input.projectId,
            parentId: input.parentId,
            createdById: context.userId,
            type: "FOLDER",
            name: input.name,
            metadata: input.metadata ? json(input.metadata) : undefined,
          },
        });
        await Promise.all([
          tx.fileActivity.create({ data: { fileNodeId: node.id, actorUserId: context.userId, type: "CREATED" } }),
          fileAudit(tx, context, "file.folder.created", node.id, { name: node.name }),
          fileEvent(tx, context, node, "file.folder.created", { name: node.name }),
        ]);
        return { ...node, canManage: authorization.isPlatformAdmin || authorization.permissions.includes("files.manage") };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("CONFLICT", "A file or folder with this name already exists here.", 409);
      }
      throw error;
    }
  }

  async createUploadIntent(context: TenantContext, input: {
    name: string;
    parentId?: string;
    projectId?: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
  }) {
    await authorizationFor(context, "files.manage");
    await assertProjectAccess(context, input.projectId);
    if (input.parentId) {
      const parent = await this.file(context, input.parentId, "EDIT", false);
      if (parent.type !== "FOLDER") throw new AppError("CONFLICT", "The selected parent is not a folder.", 409);
      if ((parent.projectId ?? null) !== (input.projectId ?? null)) throw new AppError("CONFLICT", "File and parent must belong to the same project scope.", 409);
    }
    return this.issueIntent(context, { ...input, expectedFileVersion: 0 });
  }

  async createVersionUploadIntent(context: TenantContext, fileId: string, input: {
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    expectedFileVersion: number;
    lockToken?: string;
  }) {
    const file = await this.file(context, fileId, "EDIT", false);
    if (file.type !== "FILE") throw new AppError("CONFLICT", "Versions can only be uploaded to files.", 409);
    this.requireLockOwnership(context, file.lock, input.lockToken);
    if (file.currentVersionNumber !== input.expectedFileVersion) throw new AppError("CONFLICT", "The file changed before the version upload started.", 409);
    return this.issueIntent(context, {
      name: file.name,
      parentId: file.parentId ?? undefined,
      projectId: file.projectId ?? undefined,
      fileNodeId: file.id,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      expectedFileVersion: input.expectedFileVersion,
    });
  }

  private async issueIntent(context: TenantContext, input: {
    name: string;
    parentId?: string;
    projectId?: string;
    fileNodeId?: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    expectedFileVersion: number;
  }) {
    const storageKey = uploadStorageKey(context.organizationId);
    const checksumSha256 = normalizeChecksum(input.checksumSha256);
    const upload = await storageProvider.createUpload({
      organizationId: context.organizationId,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256,
    });
    const intent = await prisma.fileUploadIntent.create({
      data: {
        organizationId: context.organizationId,
        projectId: input.projectId,
        parentId: input.parentId,
        fileNodeId: input.fileNodeId,
        createdById: context.userId,
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        checksumSha256,
        storageProvider: storageProvider.key,
        storageKey,
        expectedFileVersion: input.expectedFileVersion,
        expiresAt: parseExpiry(upload.expiresAt),
      },
    });
    return { intent, upload };
  }

  async completeUpload(context: TenantContext, intentId: string) {
    await authorizationFor(context, "files.manage");
    const intent = await prisma.fileUploadIntent.findFirst({ where: { id: intentId, organizationId: context.organizationId } });
    if (!intent) throw new AppError("NOT_FOUND", "Upload intent not found.", 404);
    if (intent.status === "COMPLETED") {
      const version = await prisma.fileVersion.findUnique({ where: { uploadIntentId: intent.id }, include: { fileNode: true } });
      if (!version) throw new AppError("CONFLICT", "Completed upload evidence is inconsistent.", 409);
      return { file: version.fileNode, version, replay: true };
    }
    if (intent.status !== "ISSUED") throw new AppError("CONFLICT", `Upload intent is ${intent.status.toLowerCase()}.`, 409);
    if (intent.expiresAt <= new Date()) {
      await prisma.fileUploadIntent.update({ where: { id: intent.id }, data: { status: "EXPIRED", failedAt: new Date(), failureCode: "EXPIRED" } });
      throw new AppError("CONFLICT", "Upload intent expired before completion.", 409);
    }
    await assertProjectAccess(context, intent.projectId);

    const evidence = await storageProvider.verifyUpload({
      organizationId: context.organizationId,
      storageKey: intent.storageKey,
      expectedMimeType: intent.mimeType,
      expectedSizeBytes: Number(intent.sizeBytes),
      expectedChecksumSha256: intent.checksumSha256,
    });
    if (
      evidence.sizeBytes !== Number(intent.sizeBytes) ||
      evidence.checksumSha256 !== intent.checksumSha256 ||
      evidence.mimeType !== intent.mimeType
    ) {
      await prisma.fileUploadIntent.update({
        where: { id: intent.id },
        data: { status: "FAILED", failedAt: new Date(), failureCode: "INTEGRITY_MISMATCH", providerEvidence: json(evidence) },
      });
      throw new AppError("CONFLICT", "Uploaded object does not match the signed intent.", 409);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const claimed = await tx.fileUploadIntent.updateMany({ where: { id: intent.id, status: "ISSUED" }, data: { status: "COMPLETED", completedAt: new Date(), providerReference: evidence.providerReference, providerEvidence: json(evidence) } });
        if (claimed.count !== 1) throw new AppError("CONFLICT", "Upload intent was completed concurrently.", 409);

        let node: FileNode;
        const versionNumber = intent.expectedFileVersion + 1;
        if (intent.fileNodeId) {
          const changed = await tx.fileNode.updateMany({
            where: { id: intent.fileNodeId, organizationId: context.organizationId, type: "FILE", deletedAt: null, currentVersionNumber: intent.expectedFileVersion },
            data: { currentVersionNumber: versionNumber },
          });
          if (changed.count !== 1) throw new AppError("CONFLICT", "The file changed before upload completion.", 409);
          node = await tx.fileNode.findUniqueOrThrow({ where: { id: intent.fileNodeId } });
        } else {
          node = await tx.fileNode.create({
            data: {
              organizationId: context.organizationId,
              projectId: intent.projectId,
              parentId: intent.parentId,
              createdById: context.userId,
              type: "FILE",
              name: intent.name,
              currentVersionNumber: 1,
            },
          });
        }

        const version = await tx.fileVersion.create({
          data: {
            fileNodeId: node.id,
            uploadedById: context.userId,
            version: versionNumber,
            storageProvider: intent.storageProvider,
            storageKey: intent.storageKey,
            mimeType: intent.mimeType,
            sizeBytes: intent.sizeBytes,
            checksumSha256: intent.checksumSha256,
            uploadIntentId: intent.id,
          },
        });
        await Promise.all([
          tx.fileActivity.create({ data: { fileNodeId: node.id, actorUserId: context.userId, type: versionNumber === 1 ? "CREATED" : "VERSION_UPLOADED", metadata: json({ versionId: version.id, version: version.version }) } }),
          fileAudit(tx, context, versionNumber === 1 ? "file.created" : "file.version.uploaded", node.id, { versionId: version.id, version: version.version }),
          fileEvent(tx, context, node, versionNumber === 1 ? "file.created" : "file.version.uploaded", { versionId: version.id, version: version.version, scanStatus: version.scanStatus }),
          tx.analyticsEvent.create({ data: { organizationId: context.organizationId, userId: context.userId, projectId: node.projectId, eventType: "file.upload.completed", properties: json({ fileNodeId: node.id, fileVersionId: version.id, sizeBytes: version.sizeBytes.toString() }) } }),
          tx.backgroundJob.upsert({
            where: { deduplicationKey: `file-scan:${version.id}` },
            create: { organizationId: context.organizationId, type: PHASE4_JOB_TYPES.FILE_SCAN, deduplicationKey: `file-scan:${version.id}`, payload: json({ fileVersionId: version.id }) },
            update: {},
          }),
          queueFileIndex(tx, context.organizationId, node.id, node.updatedAt, "UPSERT"),
        ]);
        return { file: node, version, replay: false };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new AppError("CONFLICT", "The upload conflicted with another file or version. Refresh and retry.", 409);
      }
      throw error;
    }
  }

  async versions(context: TenantContext, fileId: string) {
    const file = await this.file(context, fileId, "VIEW");
    if (file.type !== "FILE") throw new AppError("CONFLICT", "Folders do not have versions.", 409);
    return file.versions;
  }

  async download(context: TenantContext, fileId: string, versionId?: string) {
    const file = await this.file(context, fileId, "DOWNLOAD", false);
    if (file.type !== "FILE") throw new AppError("CONFLICT", "Folders cannot be downloaded.", 409);
    const version = versionId ? file.versions.find((candidate) => candidate.id === versionId) : file.versions[0];
    if (!version) throw new AppError("NOT_FOUND", "File version not found.", 404);
    if (version.scanStatus !== "CLEAN") throw new AppError("CONFLICT", "File download is blocked until malware scanning succeeds.", 409);
    const download = await storageProvider.createDownload({ organizationId: context.organizationId, storageKey: version.storageKey, downloadName: file.name });
    await prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.fileActivity.create({ data: { fileNodeId: file.id, actorUserId: context.userId, type: "DOWNLOADED", metadata: json({ versionId: version.id, version: version.version }) } }),
        fileAudit(tx, context, "file.downloaded", file.id, { versionId: version.id, version: version.version }),
        tx.analyticsEvent.create({ data: { organizationId: context.organizationId, userId: context.userId, projectId: file.projectId, eventType: "file.downloaded", properties: json({ fileNodeId: file.id, fileVersionId: version.id }) } }),
      ]);
    });
    return { ...download, fileName: file.name, version: version.version };
  }

  async update(context: TenantContext, fileId: string, input: {
    name?: string;
    parentId?: string | null;
    retentionUntil?: Date | null;
    legalHold?: boolean;
    metadata?: Record<string, unknown>;
    deleted?: boolean;
    lockToken?: string;
  }) {
    const file = await this.file(context, fileId, "MANAGE");
    this.requireLockOwnership(context, file.lock, input.lockToken);
    if (input.deleted === true) {
      if (file.legalHold) throw new AppError("CONFLICT", "A file under legal hold cannot be deleted.", 409);
      if (file.retentionUntil && file.retentionUntil > new Date()) throw new AppError("CONFLICT", "The file cannot be deleted before its retention period ends.", 409);
      if (file.type === "FOLDER" && await prisma.fileNode.count({ where: { parentId: file.id, deletedAt: null } })) {
        throw new AppError("CONFLICT", "Empty the folder before deleting it.", 409);
      }
    }
    if (input.parentId !== undefined) {
      if (input.parentId === file.id) throw new AppError("CONFLICT", "A folder cannot contain itself.", 409);
      if (input.parentId) {
        const parent = await this.file(context, input.parentId, "EDIT", false);
        if (parent.type !== "FOLDER" || parent.projectId !== file.projectId) throw new AppError("CONFLICT", "The destination folder is incompatible.", 409);
        let ancestor: string | null = parent.id;
        for (let depth = 0; ancestor && depth < 128; depth += 1) {
          if (ancestor === file.id) throw new AppError("CONFLICT", "A folder cannot be moved into its descendant.", 409);
          ancestor = (await prisma.fileNode.findUnique({ where: { id: ancestor }, select: { parentId: true } }))?.parentId ?? null;
        }
      }
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.fileNode.update({
          where: { id: file.id },
          data: {
            name: input.name,
            parentId: input.parentId,
            retentionUntil: input.retentionUntil,
            legalHold: input.legalHold,
            metadata: input.metadata ? json(input.metadata) : undefined,
            deletedAt: input.deleted === true ? new Date() : input.deleted === false ? null : undefined,
          },
        });
        const activity = input.legalHold !== undefined ? "LEGAL_HOLD_CHANGED" : input.deleted === true ? "DELETED" : input.deleted === false ? "RESTORED" : input.parentId !== undefined ? "MOVED" : "RENAMED";
        await Promise.all([
          tx.fileActivity.create({ data: { fileNodeId: file.id, actorUserId: context.userId, type: activity, metadata: json({ fields: Object.keys(input).filter((key) => key !== "lockToken") }) } }),
          fileAudit(tx, context, `file.${activity.toLowerCase()}`, file.id, { fields: Object.keys(input).filter((key) => key !== "lockToken") }),
          fileEvent(tx, context, updated, `file.${activity.toLowerCase()}`, { deletedAt: updated.deletedAt, legalHold: updated.legalHold }),
          queueFileIndex(tx, context.organizationId, file.id, updated.updatedAt, input.deleted === true ? "DELETE" : "UPSERT"),
        ]);
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("CONFLICT", "A file or folder with this name already exists at the destination.", 409);
      throw error;
    }
  }

  async lock(context: TenantContext, fileId: string, minutes: number) {
    const file = await this.file(context, fileId, "EDIT", false);
    if (file.type !== "FILE") throw new AppError("CONFLICT", "Only files can be locked.", 409);
    const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    return prisma.$transaction(async (tx) => {
      const current = await tx.fileLock.findUnique({ where: { fileNodeId: file.id } });
      if (current && current.expiresAt > new Date() && current.lockedById !== context.userId) throw new AppError("CONFLICT", "The file is already locked by another user.", 409);
      const lock = await tx.fileLock.upsert({
        where: { fileNodeId: file.id },
        create: { fileNodeId: file.id, lockedById: context.userId, tokenHash, expiresAt: new Date(Date.now() + minutes * 60_000) },
        update: { lockedById: context.userId, tokenHash, expiresAt: new Date(Date.now() + minutes * 60_000) },
      });
      await Promise.all([
        tx.fileActivity.create({ data: { fileNodeId: file.id, actorUserId: context.userId, type: "LOCKED", metadata: json({ expiresAt: lock.expiresAt }) } }),
        fileEvent(tx, context, file, "file.locked", { lockedById: context.userId, expiresAt: lock.expiresAt }),
      ]);
      return { lock, lockToken: raw };
    }, { isolationLevel: "Serializable" });
  }

  async unlock(context: TenantContext, fileId: string, lockToken: string) {
    const file = await this.file(context, fileId, "EDIT");
    const current = file.lock;
    if (!current) return { unlocked: true, replay: true };
    this.requireLockOwnership(context, current, lockToken);
    await prisma.$transaction(async (tx) => {
      await tx.fileLock.delete({ where: { id: current.id } });
      await Promise.all([
        tx.fileActivity.create({ data: { fileNodeId: file.id, actorUserId: context.userId, type: "UNLOCKED" } }),
        fileEvent(tx, context, file, "file.unlocked", { lockedById: context.userId }),
      ]);
    });
    return { unlocked: true, replay: false };
  }

  async bindProjectAttachment(context: TenantContext, projectId: string, input: { fileVersionId: string; taskId?: string }) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR"]);
    await requirePermission(context, "files.manage");
    const version = await prisma.fileVersion.findFirst({
      where: { id: input.fileVersionId, fileNode: { organizationId: context.organizationId, projectId, deletedAt: null } },
      include: { fileNode: true, projectAttachment: true },
    });
    if (!version) throw new AppError("NOT_FOUND", "Governed file version not found for this project.", 404);
    if (version.scanStatus !== "CLEAN") throw new AppError("CONFLICT", "Only a clean scanned file version can become a project attachment.", 409);
    if (input.taskId && !(await prisma.projectTask.findFirst({ where: { id: input.taskId, projectId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Project task not found.", 404);
    if (version.projectAttachment) return version.projectAttachment;
    return prisma.$transaction(async (tx) => {
      const attachment = await tx.projectAttachment.create({
        data: {
          projectId,
          taskId: input.taskId,
          uploadedById: context.userId,
          filename: version.fileNode.name,
          storageKey: version.storageKey,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          checksumSha256: version.checksumSha256,
          fileVersionId: version.id,
        },
      });
      await tx.projectActivity.create({
        data: { projectId, actorUserId: context.userId, type: "ATTACHMENT_ADDED", resourceType: "ProjectAttachment", resourceId: attachment.id, summary: `Governed attachment added: ${attachment.filename}.`, metadata: json({ fileNodeId: version.fileNodeId, fileVersionId: version.id }) },
      });
      return attachment;
    });
  }

  async processNextScan(workerId: string) {
    const { runClaimedPhase4Job } = await import("@/lib/jobs/phase4-job.service");
    return runClaimedPhase4Job(workerId, [PHASE4_JOB_TYPES.FILE_SCAN], async (job) => {
      const payload = job.payload as { fileVersionId?: string };
      if (!payload.fileVersionId) throw new AppError("VALIDATION_ERROR", "File scan job payload is invalid.", 422);
      const version = await prisma.fileVersion.findFirst({
        where: { id: payload.fileVersionId, fileNode: { organizationId: job.organizationId ?? undefined } },
        include: { fileNode: true },
      });
      if (!version) throw new AppError("NOT_FOUND", "File version for scanning was not found.", 404);
      if (version.scanStatus === "CLEAN" || version.scanStatus === "INFECTED") return { versionId: version.id, status: version.scanStatus, replay: true };
      const submission = await fileScanProvider.submit({
        organizationId: version.fileNode.organizationId,
        fileVersionId: version.id,
        storageProvider: version.storageProvider,
        storageKey: version.storageKey,
        mimeType: version.mimeType,
        checksumSha256: version.checksumSha256,
      });
      await prisma.fileVersion.update({ where: { id: version.id }, data: { scanProviderRef: submission.providerReference, scanStatus: "PENDING" } });
      return { versionId: version.id, status: "SUBMITTED", providerReference: submission.providerReference };
    });
  }
}
