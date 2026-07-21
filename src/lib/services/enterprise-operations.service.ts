import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { AppError } from "@/lib/errors/app-error";
import { aiProvider } from "@/lib/providers/integrations";
import { pingRedis } from "@/lib/realtime/redis";
import { runClaimedJob } from "@/lib/jobs/worker-runtime.service";
import { processNotificationDeliveries } from "@/lib/notifications/delivery-worker";
import type { TenantContext } from "@/lib/tenancy/context";

const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? nested.toString() : nested)) as Prisma.InputJsonValue;
const configured = (...keys: string[]) => keys.every((key) => Boolean(process.env[key]));

async function databaseHealth() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy" as const, latencyMs: Date.now() - started };
  } catch {
    return { status: "unhealthy" as const, latencyMs: Date.now() - started };
  }
}

function pageResult<T extends { id: string }>(rows: T[], take: number) {
  const hasMore = rows.length > take;
  if (hasMore) rows.pop();
  return { items: rows, nextCursor: hasMore ? rows.at(-1)?.id ?? null : null };
}

async function operationsAudit(context: TenantContext, action: string, resourceType: string, resourceId?: string, metadata?: unknown) {
  return prisma.auditEvent.create({
    data: { organizationId: context.organizationId, actorUserId: context.userId, action, resourceType, resourceId, outcome: "SUCCESS", metadata: metadata === undefined ? undefined : json(metadata) },
  });
}

export class EnterpriseOperationsService {
  async summary(context: TenantContext) {
    await requirePermission(context, "platform.operations.read");
    const staleBefore = new Date(Date.now() - 2 * 60_000);
    const [database, realtime, ai, jobGroups, deadLetters, workers, exports, moderation, support, security, schedules] = await Promise.all([
      databaseHealth(),
      pingRedis(),
      aiProvider.status(),
      prisma.backgroundJob.groupBy({ by: ["status"], where: { organizationId: context.organizationId }, _count: true }),
      prisma.deadLetterJob.count({ where: { job: { organizationId: context.organizationId, status: "DEAD_LETTER" }, resolvedAt: null } }),
      prisma.workerHeartbeat.count({ where: { organizationId: context.organizationId, lastSeenAt: { gte: staleBefore }, status: "ACTIVE" } }),
      prisma.dataExportJob.groupBy({ by: ["status"], where: { organizationId: context.organizationId }, _count: true }),
      prisma.abuseReport.count({ where: { organizationId: context.organizationId, status: { in: ["OPEN", "TRIAGED", "INVESTIGATING"] } } }),
      prisma.supportCase.count({ where: { organizationId: context.organizationId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }),
      prisma.securityEvent.count({ where: { organizationId: context.organizationId, resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] } } }),
      prisma.jobSchedule.count({ where: { organizationId: context.organizationId, enabled: true } }),
    ]);
    const authorization = await resolveAuthorization(context);
    return {
      readiness: { status: database.status === "healthy" && realtime ? "ready" : "degraded", database, realtime: { status: realtime ? "healthy" : "unhealthy" }, checkedAt: new Date() },
      queues: { byStatus: Object.fromEntries(jobGroups.map((group) => [group.status, group._count])), deadLetters },
      operations: { activeWorkers: workers, schedules, openModeration: moderation, openSupport: support, unresolvedHighSecurity: security, exports: Object.fromEntries(exports.map((group) => [group.status, group._count])) },
      providers: {
        ai,
        storage: { configured: configured("STORAGE_SIGNING_ENDPOINT", "STORAGE_SIGNING_TOKEN") },
        payments: { configured: configured("PAYMENT_PROVIDER_BASE_URL", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET") },
        notifications: { configured: configured("NOTIFICATION_PROVIDER_BASE_URL", "NOTIFICATION_PROVIDER_API_KEY") },
        fileScanning: { configured: configured("FILE_SCAN_PROVIDER_BASE_URL", "FILE_SCAN_PROVIDER_API_KEY", "FILE_SCAN_WEBHOOK_SECRET") || configured("FILE_SCAN_PROVIDER_BASE_URL", "FILE_SCAN_PROVIDER_TOKEN", "FILE_SCAN_WEBHOOK_SECRET") },
      },
      capabilities: {
        manageJobs: authorization.isPlatformAdmin || authorization.permissions.includes("platform.operations.manage"),
        manageSecurity: authorization.isPlatformAdmin || authorization.permissions.includes("security.events.manage"),
        manageModeration: authorization.isPlatformAdmin || authorization.permissions.includes("moderation.manage"),
        manageSupport: authorization.isPlatformAdmin || authorization.permissions.includes("support.manage"),
        manageRetention: authorization.isPlatformAdmin || authorization.permissions.includes("compliance.manage"),
        exportData: authorization.isPlatformAdmin || authorization.permissions.includes("data.export"),
      },
    };
  }

  async jobs(context: TenantContext, input: { status?: string; type?: string; queue?: string; cursor?: string; take: number }) {
    await requirePermission(context, "platform.operations.read");
    const rows = await prisma.backgroundJob.findMany({
      where: { organizationId: context.organizationId, ...(input.status ? { status: input.status as never } : {}), ...(input.type ? { type: input.type } : {}), ...(input.queue ? { queue: input.queue } : {}) },
      include: { attemptHistory: { orderBy: { attemptNumber: "desc" }, take: 10 }, deadLetter: true, schedule: { select: { id: true, key: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return pageResult(rows, input.take);
  }

  private async managedJob(context: TenantContext, jobId: string) {
    await requirePermission(context, "platform.operations.manage");
    const job = await prisma.backgroundJob.findFirst({ where: { id: jobId, organizationId: context.organizationId }, include: { deadLetter: true } });
    if (!job) throw new AppError("NOT_FOUND", "Background job not found.", 404);
    return job;
  }

  async retryJob(context: TenantContext, jobId: string, reason?: string) {
    const job = await this.managedJob(context, jobId);
    if (!["FAILED", "CANCELLED"].includes(job.status)) throw new AppError("CONFLICT", "Only failed or cancelled jobs can be retried directly.", 409);
    const updated = await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "PENDING", maxAttempts: job.attempts + Math.max(job.maxAttempts, 1), availableAt: new Date(), completedAt: null, lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, failureCode: null, lastError: null } });
    await operationsAudit(context, "operations.job.retried", "BackgroundJob", job.id, { reason: reason ?? null });
    return updated;
  }

  async cancelJob(context: TenantContext, jobId: string, reason?: string) {
    const job = await this.managedJob(context, jobId);
    if (!["PENDING", "PROCESSING"].includes(job.status)) throw new AppError("CONFLICT", "Only pending or processing jobs can be cancelled.", 409);
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.backgroundJob.updateMany({ where: { id: job.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "CANCELLED", completedAt: now, lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, failureCode: "CANCELLED_BY_OPERATOR", lastError: reason ?? "Cancelled by operator." } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The job changed before cancellation.", 409);
      await tx.backgroundJobAttempt.updateMany({ where: { jobId: job.id, status: "RUNNING" }, data: { status: "CANCELLED", completedAt: now, errorCode: "CANCELLED_BY_OPERATOR", errorMessage: reason ?? "Cancelled by operator." } });
      return tx.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    });
    await operationsAudit(context, "operations.job.cancelled", "BackgroundJob", job.id, { reason: reason ?? null });
    return updated;
  }

  async recoverDeadLetter(context: TenantContext, jobId: string, reason?: string) {
    const job = await this.managedJob(context, jobId);
    if (job.status !== "DEAD_LETTER" || !job.deadLetter) throw new AppError("CONFLICT", "The job is not in the dead-letter queue.", 409);
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.deadLetterJob.update({ where: { originalJobId: job.id }, data: { resolvedAt: now, resolvedById: context.userId, resolution: reason ?? "Recovered for controlled replay.", recoveryCount: { increment: 1 } } });
      return tx.backgroundJob.update({ where: { id: job.id }, data: { status: "PENDING", maxAttempts: job.attempts + Math.max(job.maxAttempts, 1), availableAt: now, completedAt: null, lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null, failureCode: null, lastError: null } });
    });
    await operationsAudit(context, "operations.dead_letter.recovered", "BackgroundJob", job.id, { reason: reason ?? null, recoveryCount: job.deadLetter.recoveryCount + 1 });
    return updated;
  }

  async workers(context: TenantContext) {
    await requirePermission(context, "platform.operations.read");
    const staleBefore = new Date(Date.now() - 2 * 60_000);
    const rows = await prisma.workerHeartbeat.findMany({ where: { organizationId: context.organizationId }, orderBy: { lastSeenAt: "desc" }, take: 200 });
    return rows.map((worker) => ({ ...worker, observedStatus: worker.lastSeenAt < staleBefore ? "OFFLINE" : worker.status }));
  }

  async schedules(context: TenantContext) {
    await requirePermission(context, "platform.operations.read");
    return prisma.jobSchedule.findMany({ where: { organizationId: context.organizationId }, orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }], take: 200 });
  }

  async createSchedule(context: TenantContext, input: { key: string; jobType: string; queue: string; payload: Record<string, unknown>; intervalSeconds: number; priority: number; maxAttempts: number; enabled: boolean; nextRunAt: Date }) {
    await requirePermission(context, "platform.operations.manage");
    const key = `${context.organizationId}:${input.key}`;
    const queue = input.jobType === "SEARCH_INCREMENTAL" ? "phase4" : "operations";
    const schedule = await prisma.jobSchedule.create({ data: { ...input, key, queue, payload: json(input.payload), organizationId: context.organizationId, createdById: context.userId } });
    await operationsAudit(context, "operations.schedule.created", "JobSchedule", schedule.id, { key: schedule.key, jobType: schedule.jobType });
    return schedule;
  }

  async updateSchedule(context: TenantContext, scheduleId: string, input: Partial<{ jobType: string; queue: string; payload: Record<string, unknown>; intervalSeconds: number; priority: number; maxAttempts: number; enabled: boolean; nextRunAt: Date }>) {
    await requirePermission(context, "platform.operations.manage");
    const schedule = await prisma.jobSchedule.findFirst({ where: { id: scheduleId, organizationId: context.organizationId } });
    if (!schedule) throw new AppError("NOT_FOUND", "Job schedule not found.", 404);
    const jobType = input.jobType ?? schedule.jobType;
    const queue = jobType === "SEARCH_INCREMENTAL" ? "phase4" : "operations";
    const updated = await prisma.jobSchedule.update({ where: { id: schedule.id }, data: { ...input, queue, payload: input.payload ? json(input.payload) : undefined } });
    await operationsAudit(context, "operations.schedule.updated", "JobSchedule", schedule.id, { fields: Object.keys(input) });
    return updated;
  }

  async exports(context: TenantContext, input: { status?: string; cursor?: string; take: number }) {
    await requirePermission(context, "data.export");
    const rows = await prisma.dataExportJob.findMany({
      where: { organizationId: context.organizationId, ...(input.status ? { status: input.status as never } : {}) },
      include: { artifact: { select: { id: true, byteSize: true, checksumSha256: true, createdAt: true } }, requestedBy: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return pageResult(rows, input.take);
  }

  async requestExport(context: TenantContext, input: { type: string; filters?: Record<string, unknown> }) {
    await requirePermission(context, "data.export");
    return prisma.$transaction(async (tx) => {
      const exportJob = await tx.dataExportJob.create({ data: { organizationId: context.organizationId, requestedById: context.userId, type: input.type, filters: input.filters ? json(input.filters) : undefined, format: "JSON" } });
      await tx.backgroundJob.create({ data: { organizationId: context.organizationId, type: "DATA_EXPORT", queue: "operations", payload: json({ exportJobId: exportJob.id }), deduplicationKey: `data-export:${exportJob.id}`, maxAttempts: 5, correlationId: `data-export:${exportJob.id}` } });
      await tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: "data.export.requested", resourceType: "DataExportJob", resourceId: exportJob.id, outcome: "SUCCESS", metadata: json({ type: input.type }) } });
      return exportJob;
    });
  }

  async exportArtifact(context: TenantContext, exportId: string) {
    await requirePermission(context, "data.export");
    const exportJob = await prisma.dataExportJob.findFirst({ where: { id: exportId, organizationId: context.organizationId, status: "COMPLETED", expiresAt: { gt: new Date() } }, include: { artifact: true } });
    if (!exportJob?.artifact) throw new AppError("NOT_FOUND", "Completed export artifact not found or expired.", 404);
    return exportJob;
  }

  private async buildExport(exportId: string) {
    const exportJob = await prisma.dataExportJob.findUnique({ where: { id: exportId } });
    if (!exportJob) throw new AppError("NOT_FOUND", "Data export request not found.", 404);
    await prisma.dataExportJob.update({ where: { id: exportJob.id }, data: { status: "PROCESSING", errorMessage: null } });
    const filters = (exportJob.filters ?? {}) as Record<string, unknown>;
    let records: unknown[];
    if (exportJob.type === "ORGANIZATION") {
      records = await prisma.organization.findMany({ where: { id: exportJob.organizationId }, select: { id: true, name: true, slug: true, status: true, settings: true, memberships: { select: { userId: true, status: true, role: { select: { name: true } } } }, createdAt: true, updatedAt: true } });
    } else if (exportJob.type === "PROJECT") {
      records = await prisma.project.findMany({ where: { organizationId: exportJob.organizationId, ...(typeof filters.projectId === "string" ? { id: filters.projectId } : {}) }, include: { milestones: true, tasks: true }, orderBy: { createdAt: "asc" }, take: 5_000 });
    } else if (exportJob.type === "FINANCE") {
      records = await prisma.invoice.findMany({ where: { organizationId: exportJob.organizationId }, include: { lines: true, transactions: { select: { id: true, type: true, status: true, amountMinor: true, currency: true, processedAt: true, createdAt: true } } }, orderBy: { createdAt: "asc" }, take: 5_000 });
    } else if (exportJob.type === "AUDIT") {
      records = await prisma.auditEvent.findMany({ where: { organizationId: exportJob.organizationId }, orderBy: { createdAt: "asc" }, take: 10_000 });
    } else {
      throw new AppError("VALIDATION_ERROR", "Unsupported data export type.", 422);
    }
    const payload = { schemaVersion: 1, type: exportJob.type, organizationId: exportJob.organizationId, generatedAt: new Date().toISOString(), filters, records };
    const encoded = JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    const checksumSha256 = createHash("sha256").update(encoded).digest("hex");
    await prisma.$transaction([
      prisma.dataExportArtifact.upsert({ where: { exportJobId: exportJob.id }, create: { exportJobId: exportJob.id, payload: json(payload), byteSize: Buffer.byteLength(encoded), checksumSha256 }, update: { payload: json(payload), byteSize: Buffer.byteLength(encoded), checksumSha256 } }),
      prisma.dataExportJob.update({ where: { id: exportJob.id }, data: { status: "COMPLETED", rowCount: records.length, checksumSha256, storageKey: null, completedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000), errorMessage: null } }),
    ]);
    return { exportJobId: exportJob.id, rowCount: records.length, byteSize: Buffer.byteLength(encoded), checksumSha256 };
  }

  private async enforceRetention(organizationId: string) {
    const now = new Date();
    const expired = await prisma.dataExportJob.findMany({ where: { organizationId, status: "COMPLETED", expiresAt: { lte: now } }, select: { id: true } });
    if (!expired.length) return { expiredExports: 0 };
    await prisma.$transaction([
      prisma.dataExportArtifact.deleteMany({ where: { exportJobId: { in: expired.map((row) => row.id) } } }),
      prisma.dataExportJob.updateMany({ where: { id: { in: expired.map((row) => row.id) } }, data: { status: "EXPIRED" } }),
    ]);
    return { expiredExports: expired.length };
  }

  async processNext(workerId: string) {
    return runClaimedJob({ workerId, types: ["DATA_EXPORT", "RETENTION_ENFORCE", "NOTIFICATION_DELIVERY"], queues: ["operations", "default"], version: "phase5" }, async (job) => {
      const payload = job.payload as { exportJobId?: string; organizationId?: string };
      if (job.type === "DATA_EXPORT") {
        if (!payload.exportJobId) throw new AppError("VALIDATION_ERROR", "Data export job payload is invalid.", 422);
        try { return await this.buildExport(payload.exportJobId); }
        catch (error) {
          await prisma.dataExportJob.updateMany({ where: { id: payload.exportJobId, organizationId: job.organizationId ?? undefined }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 2_000) : "Export processing failed." } });
          throw error;
        }
      }
      if (job.type === "NOTIFICATION_DELIVERY") {
        if (!job.organizationId) throw new AppError("VALIDATION_ERROR", "Notification delivery schedule organization is missing.", 422);
        return { deliveries: await processNotificationDeliveries(100, job.organizationId) };
      }
      const organizationId = job.organizationId ?? payload.organizationId;
      if (!organizationId) throw new AppError("VALIDATION_ERROR", "Retention job organization is missing.", 422);
      return this.enforceRetention(organizationId);
    });
  }

  async moderation(context: TenantContext) {
    await requirePermission(context, "moderation.manage");
    return prisma.abuseReport.findMany({ where: { organizationId: context.organizationId }, include: { reporter: { select: { id: true, displayName: true, email: true } }, assignedTo: { select: { id: true, displayName: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 });
  }

  async decideModeration(context: TenantContext, input: { reportId: string; status: "TRIAGED" | "INVESTIGATING" | "ACTIONED" | "DISMISSED"; resolution: string }) {
    await requirePermission(context, "moderation.manage");
    const changed = await prisma.abuseReport.updateMany({ where: { id: input.reportId, organizationId: context.organizationId }, data: { status: input.status, resolution: input.resolution, assignedToId: context.userId } });
    if (!changed.count) throw new AppError("NOT_FOUND", "Abuse report not found.", 404);
    await operationsAudit(context, "moderation.report.decided", "AbuseReport", input.reportId, { status: input.status, resolution: input.resolution });
    return prisma.abuseReport.findUniqueOrThrow({ where: { id: input.reportId } });
  }

  async supportCases(context: TenantContext) {
    await requirePermission(context, "support.manage");
    return prisma.supportCase.findMany({ where: { organizationId: context.organizationId }, include: { requester: { select: { id: true, displayName: true, email: true } }, assignedTo: { select: { id: true, displayName: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200 });
  }

  async createSupportCase(context: TenantContext, input: { subject: string; description: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" }) {
    await requirePermission(context, "support.manage");
    const supportCase = await prisma.supportCase.create({ data: { organizationId: context.organizationId, requesterId: context.userId, number: `SUP-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`, ...input } });
    await operationsAudit(context, "support.case.created", "SupportCase", supportCase.id, { number: supportCase.number, priority: supportCase.priority });
    return supportCase;
  }

  async updateSupportCase(context: TenantContext, caseId: string, input: { status: "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED"; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; assignedToId?: string | null; resolution?: string | null }) {
    await requirePermission(context, "support.manage");
    if (input.assignedToId) {
      const member = await prisma.membership.findFirst({ where: { organizationId: context.organizationId, userId: input.assignedToId, status: "ACTIVE" }, select: { id: true } });
      if (!member) throw new AppError("NOT_FOUND", "Support assignee is not an active organization member.", 404);
    }
    const changed = await prisma.supportCase.updateMany({ where: { id: caseId, organizationId: context.organizationId }, data: { ...input, resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? new Date() : null } });
    if (!changed.count) throw new AppError("NOT_FOUND", "Support case not found.", 404);
    await operationsAudit(context, "support.case.updated", "SupportCase", caseId, { status: input.status, assignedToId: input.assignedToId ?? null });
    return prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
  }

  async securityEvents(context: TenantContext) {
    await requirePermission(context, "security.events.read");
    return prisma.securityEvent.findMany({ where: { organizationId: context.organizationId }, include: { user: { select: { id: true, displayName: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 500 });
  }

  async updateSecurityEvent(context: TenantContext, eventId: string, input: { resolved: boolean; note?: string }) {
    await requirePermission(context, "security.events.manage");
    const event = await prisma.securityEvent.findFirst({ where: { id: eventId, organizationId: context.organizationId } });
    if (!event) throw new AppError("NOT_FOUND", "Security event not found.", 404);
    const metadata = { ...((event.metadata as Record<string, unknown> | null) ?? {}), resolutionNote: input.note ?? null, resolvedById: context.userId };
    const updated = await prisma.securityEvent.update({ where: { id: event.id }, data: { resolvedAt: input.resolved ? new Date() : null, metadata: json(metadata) } });
    await operationsAudit(context, input.resolved ? "security.event.resolved" : "security.event.reopened", "SecurityEvent", event.id, { note: input.note ?? null });
    return updated;
  }

  async retentionPolicies(context: TenantContext) {
    await requirePermission(context, "compliance.manage");
    return prisma.dataRetentionPolicy.findMany({ where: { organizationId: context.organizationId }, orderBy: { resourceType: "asc" } });
  }

  async upsertRetentionPolicy(context: TenantContext, input: { resourceType: string; retentionDays: number; legalHoldDefault: boolean; configuration?: Record<string, unknown> }) {
    await requirePermission(context, "compliance.manage");
    const policy = await prisma.dataRetentionPolicy.upsert({ where: { organizationId_resourceType: { organizationId: context.organizationId, resourceType: input.resourceType } }, create: { organizationId: context.organizationId, resourceType: input.resourceType, retentionDays: input.retentionDays, legalHoldDefault: input.legalHoldDefault, configuration: input.configuration ? json(input.configuration) : undefined }, update: { retentionDays: input.retentionDays, legalHoldDefault: input.legalHoldDefault, configuration: input.configuration ? json(input.configuration) : undefined } });
    await operationsAudit(context, "compliance.retention.updated", "DataRetentionPolicy", policy.id, { resourceType: policy.resourceType, retentionDays: policy.retentionDays, legalHoldDefault: policy.legalHoldDefault });
    return policy;
  }
}
