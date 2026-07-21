import { randomUUID } from "node:crypto";
import { Prisma, type BackgroundJob } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const DEFAULT_LEASE_MS = 60_000;

export type EnqueueJobInput = {
  organizationId?: string | null;
  type: string;
  queue?: string;
  payload: unknown;
  deduplicationKey?: string;
  availableAt?: Date;
  maxAttempts?: number;
  priority?: number;
  scheduleId?: string;
  correlationId?: string;
};

export type ClaimedJob = {
  job: BackgroundJob;
  leaseToken: string;
};

function errorDetails(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message.slice(0, 2_000) };
  if (error instanceof Error && "code" in error && typeof error.code === "string") return { code: error.code.slice(0, 100), message: error.message.slice(0, 2_000) };
  if (error instanceof Error) return { code: "WORKER_ERROR", message: error.message.slice(0, 2_000) };
  return { code: "WORKER_ERROR", message: "Unknown background worker error." };
}

function retryAt(attempts: number) {
  const seconds = Math.min(900, Math.max(2, 2 ** Math.min(attempts, 9)));
  return new Date(Date.now() + seconds * 1_000);
}

export async function enqueueJob(input: EnqueueJobInput) {
  const data = {
    organizationId: input.organizationId ?? undefined,
    type: input.type,
    queue: input.queue ?? "default",
    payload: json(input.payload),
    deduplicationKey: input.deduplicationKey,
    availableAt: input.availableAt,
    maxAttempts: input.maxAttempts ?? 10,
    priority: input.priority ?? 100,
    scheduleId: input.scheduleId,
    correlationId: input.correlationId,
  };
  if (!input.deduplicationKey) return prisma.backgroundJob.create({ data });
  return prisma.backgroundJob.upsert({
    where: { deduplicationKey: input.deduplicationKey },
    create: data,
    update: {},
  });
}

export async function registerWorker(input: {
  workerId: string;
  organizationId?: string | null;
  queues: string[];
  version?: string;
  hostname?: string;
  currentJobId?: string | null;
  status?: string;
}) {
  const now = new Date();
  return prisma.workerHeartbeat.upsert({
    where: { workerId: input.workerId },
    create: {
      workerId: input.workerId,
      organizationId: input.organizationId ?? undefined,
      queues: input.queues,
      version: input.version,
      hostname: input.hostname,
      currentJobId: input.currentJobId,
      status: input.status ?? "ACTIVE",
      startedAt: now,
      lastSeenAt: now,
    },
    update: {
      organizationId: input.organizationId ?? undefined,
      queues: input.queues,
      version: input.version,
      hostname: input.hostname,
      currentJobId: input.currentJobId,
      status: input.status ?? "ACTIVE",
      lastSeenAt: now,
    },
  });
}

export async function claimJob(input: {
  workerId: string;
  types?: string[];
  queues?: string[];
  organizationId?: string;
  leaseMs?: number;
  version?: string;
  hostname?: string;
}): Promise<ClaimedJob | null> {
  const now = new Date();
  const leaseMs = Math.max(5_000, Math.min(input.leaseMs ?? DEFAULT_LEASE_MS, 15 * 60_000));
  const candidate = await prisma.backgroundJob.findFirst({
    where: {
      ...(input.types?.length ? { type: { in: input.types } } : {}),
      ...(input.queues?.length ? { queue: { in: input.queues } } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      availableAt: { lte: now },
      attempts: { lt: prisma.backgroundJob.fields.maxAttempts },
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: [{ priority: "asc" }, { availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  if (!candidate) {
    await registerWorker({
      workerId: input.workerId,
      organizationId: input.organizationId,
      queues: input.queues ?? ["default"],
      version: input.version,
      hostname: input.hostname,
      currentJobId: null,
    });
    return null;
  }

  const leaseToken = randomUUID();
  const attemptNumber = candidate.attempts + 1;
  return prisma.$transaction(async (tx) => {
    const changed = await tx.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        attempts: candidate.attempts,
        status: candidate.status,
        ...(candidate.status === "PROCESSING"
          ? { leaseExpiresAt: { lte: now } }
          : {}),
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: input.workerId,
        leaseToken,
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastStartedAt: now,
        lastError: null,
        failureCode: null,
      },
    });
    if (changed.count !== 1) return null;
    if (candidate.status === "PROCESSING") {
      await tx.backgroundJobAttempt.updateMany({
        where: { jobId: candidate.id, status: "RUNNING" },
        data: { status: "LEASE_LOST", completedAt: now, errorCode: "LEASE_EXPIRED", errorMessage: "The worker lease expired before completion." },
      });
    }
    await tx.backgroundJobAttempt.create({
      data: { jobId: candidate.id, attemptNumber, workerId: input.workerId, leaseToken, heartbeatAt: now },
    });
    await tx.workerHeartbeat.upsert({
      where: { workerId: input.workerId },
      create: {
        workerId: input.workerId,
        organizationId: input.organizationId ?? candidate.organizationId,
        queues: input.queues ?? [candidate.queue],
        version: input.version,
        hostname: input.hostname,
        currentJobId: candidate.id,
        startedAt: now,
        lastSeenAt: now,
      },
      update: {
        organizationId: input.organizationId ?? candidate.organizationId,
        queues: input.queues ?? [candidate.queue],
        version: input.version,
        hostname: input.hostname,
        status: "ACTIVE",
        currentJobId: candidate.id,
        lastSeenAt: now,
      },
    });
    const job = await tx.backgroundJob.findUniqueOrThrow({ where: { id: candidate.id } });
    return { job, leaseToken };
  });
}

export async function heartbeatJob(input: {
  jobId: string;
  workerId: string;
  leaseToken: string;
  leaseMs?: number;
}) {
  const now = new Date();
  const leaseMs = Math.max(5_000, Math.min(input.leaseMs ?? DEFAULT_LEASE_MS, 15 * 60_000));
  const changed = await prisma.backgroundJob.updateMany({
    where: { id: input.jobId, status: "PROCESSING", lockedBy: input.workerId, leaseToken: input.leaseToken, leaseExpiresAt: { gt: now } },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
  if (changed.count !== 1) throw new AppError("CONFLICT", "The background job lease is no longer owned by this worker.", 409);
  await prisma.$transaction([
    prisma.backgroundJobAttempt.updateMany({ where: { jobId: input.jobId, leaseToken: input.leaseToken, status: "RUNNING" }, data: { heartbeatAt: now } }),
    prisma.workerHeartbeat.updateMany({ where: { workerId: input.workerId }, data: { lastSeenAt: now, currentJobId: input.jobId, status: "ACTIVE" } }),
  ]);
  return { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) };
}

export async function getActiveClaim(input: { jobId: string; workerId: string; leaseToken: string }): Promise<ClaimedJob> {
  const job = await prisma.backgroundJob.findFirst({
    where: { id: input.jobId, status: "PROCESSING", lockedBy: input.workerId, leaseToken: input.leaseToken, leaseExpiresAt: { gt: new Date() } },
  });
  if (!job) throw new AppError("CONFLICT", "The background job lease is no longer owned by this worker.", 409);
  return { job, leaseToken: input.leaseToken };
}

export async function completeJob(claim: ClaimedJob, diagnostics?: unknown) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const changed = await tx.backgroundJob.updateMany({
      where: { id: claim.job.id, status: "PROCESSING", lockedBy: claim.job.lockedBy, leaseToken: claim.leaseToken },
      data: {
        status: "COMPLETED",
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        lastError: null,
        failureCode: null,
      },
    });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The background job lease is no longer owned by this worker.", 409);
    await tx.backgroundJobAttempt.updateMany({
      where: { jobId: claim.job.id, leaseToken: claim.leaseToken, status: "RUNNING" },
      data: { status: "COMPLETED", completedAt: now, diagnostics: diagnostics === undefined ? undefined : json(diagnostics) },
    });
    if (claim.job.lockedBy) await tx.workerHeartbeat.updateMany({ where: { workerId: claim.job.lockedBy }, data: { currentJobId: null, lastSeenAt: now } });
    return tx.backgroundJob.findUniqueOrThrow({ where: { id: claim.job.id } });
  });
}

export async function failJob(claim: ClaimedJob, error: unknown, diagnostics?: unknown) {
  const now = new Date();
  const details = errorDetails(error);
  const exhausted = claim.job.attempts >= claim.job.maxAttempts;
  return prisma.$transaction(async (tx) => {
    const changed = await tx.backgroundJob.updateMany({
      where: { id: claim.job.id, status: "PROCESSING", lockedBy: claim.job.lockedBy, leaseToken: claim.leaseToken },
      data: {
        status: exhausted ? "DEAD_LETTER" : "PENDING",
        availableAt: exhausted ? claim.job.availableAt : retryAt(claim.job.attempts),
        lockedAt: null,
        lockedBy: null,
        leaseToken: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        lastError: details.message,
        failureCode: details.code,
      },
    });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The background job lease is no longer owned by this worker.", 409);
    await tx.backgroundJobAttempt.updateMany({
      where: { jobId: claim.job.id, leaseToken: claim.leaseToken, status: "RUNNING" },
      data: { status: "FAILED", completedAt: now, errorCode: details.code, errorMessage: details.message, diagnostics: diagnostics === undefined ? undefined : json(diagnostics) },
    });
    if (claim.job.lockedBy) await tx.workerHeartbeat.updateMany({ where: { workerId: claim.job.lockedBy }, data: { currentJobId: null, lastSeenAt: now } });
    if (exhausted) {
      await tx.deadLetterJob.upsert({
        where: { originalJobId: claim.job.id },
        create: {
          originalJobId: claim.job.id,
          snapshot: json({ type: claim.job.type, queue: claim.job.queue, payload: claim.job.payload, attempts: claim.job.attempts, correlationId: claim.job.correlationId }),
          reason: details.message,
        },
        update: {
          snapshot: json({ type: claim.job.type, queue: claim.job.queue, payload: claim.job.payload, attempts: claim.job.attempts, correlationId: claim.job.correlationId }),
          reason: details.message,
          failedAt: now,
          resolvedAt: null,
          resolvedById: null,
          resolution: null,
        },
      });
    }
    return tx.backgroundJob.findUniqueOrThrow({ where: { id: claim.job.id } });
  });
}

export async function runClaimedJob<T>(
  input: { workerId: string; types?: string[]; queues?: string[]; organizationId?: string; leaseMs?: number; version?: string; hostname?: string },
  operation: (job: BackgroundJob, leaseToken: string) => Promise<T>,
) {
  const claim = await claimJob(input);
  if (!claim) return null;
  try {
    const result = await operation(claim.job, claim.leaseToken);
    await completeJob(claim, result);
    return { jobId: claim.job.id, result };
  } catch (error) {
    await failJob(claim, error);
    throw error;
  }
}

export async function enqueueDueSchedules(limit = 100) {
  const now = new Date();
  const schedules = await prisma.jobSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(limit, 1), 500),
  });
  const jobs: BackgroundJob[] = [];
  for (const schedule of schedules) {
    const slot = schedule.nextRunAt.toISOString();
    const nextRunAt = new Date(schedule.nextRunAt.getTime() + schedule.intervalSeconds * 1_000);
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.jobSchedule.updateMany({
        where: { id: schedule.id, enabled: true, nextRunAt: schedule.nextRunAt },
        data: { nextRunAt: nextRunAt <= now ? new Date(now.getTime() + schedule.intervalSeconds * 1_000) : nextRunAt, lastEnqueuedAt: now },
      });
      if (changed.count !== 1) return null;
      return tx.backgroundJob.upsert({
        where: { deduplicationKey: `schedule:${schedule.id}:${slot}` },
        create: {
          organizationId: schedule.organizationId,
          type: schedule.jobType,
          queue: schedule.queue,
          payload: json(schedule.payload),
          priority: schedule.priority,
          maxAttempts: schedule.maxAttempts,
          scheduleId: schedule.id,
          deduplicationKey: `schedule:${schedule.id}:${slot}`,
          correlationId: `schedule:${schedule.id}`,
        },
        update: {},
      });
    });
    if (result) jobs.push(result);
  }
  return jobs;
}
