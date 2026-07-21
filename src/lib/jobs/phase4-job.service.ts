import { Prisma, type BackgroundJob } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const LEASE_MS = 60_000;

export const PHASE4_JOB_TYPES = {
  FILE_SCAN: "FILE_SCAN",
  SEARCH_ENTITY: "SEARCH_ENTITY",
  SEARCH_REINDEX: "SEARCH_REINDEX",
  SEARCH_INCREMENTAL: "SEARCH_INCREMENTAL",
  ANALYTICS_AGGREGATE: "ANALYTICS_AGGREGATE",
} as const;

export type Phase4JobType = (typeof PHASE4_JOB_TYPES)[keyof typeof PHASE4_JOB_TYPES];

export async function enqueuePhase4Job(input: {
  organizationId: string;
  type: Phase4JobType;
  payload: unknown;
  deduplicationKey: string;
  availableAt?: Date;
  maxAttempts?: number;
}) {
  return prisma.backgroundJob.upsert({
    where: { deduplicationKey: input.deduplicationKey },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      payload: json(input.payload),
      deduplicationKey: input.deduplicationKey,
      availableAt: input.availableAt,
      maxAttempts: input.maxAttempts ?? 8,
    },
    update: {},
  });
}

export async function claimPhase4Job(workerId: string, types: Phase4JobType[]) {
  const now = new Date();
  const candidate = await prisma.backgroundJob.findFirst({
    where: {
      type: { in: types },
      availableAt: { lte: now },
      attempts: { lt: prisma.backgroundJob.fields.maxAttempts },
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;

  const claimed = await prisma.backgroundJob.updateMany({
    where: {
      id: candidate.id,
      attempts: candidate.attempts,
      status: candidate.status,
      ...(candidate.status === "PROCESSING" ? { leaseExpiresAt: { lte: now } } : {}),
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lockedAt: now,
      lockedBy: workerId,
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      lastError: null,
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.backgroundJob.findUniqueOrThrow({ where: { id: candidate.id } });
}

export async function completePhase4Job(jobId: string, workerId: string) {
  const changed = await prisma.backgroundJob.updateMany({
    where: { id: jobId, status: "PROCESSING", lockedBy: workerId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      lastError: null,
    },
  });
  if (changed.count !== 1) throw new AppError("CONFLICT", "The background job lease is no longer owned by this worker.", 409);
}

export async function retryPhase4Job(job: BackgroundJob, workerId: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown Phase 4 worker error";
  const exhausted = job.attempts >= job.maxAttempts;
  await prisma.$transaction(async (tx) => {
    const changed = await tx.backgroundJob.updateMany({
      where: { id: job.id, status: "PROCESSING", lockedBy: workerId },
      data: {
        status: exhausted ? "DEAD_LETTER" : "PENDING",
        availableAt: exhausted ? job.availableAt : new Date(Date.now() + Math.min(300_000, 2 ** job.attempts * 1_000)),
        lockedAt: null,
        lockedBy: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        lastError: message,
      },
    });
    if (changed.count !== 1) return;
    if (exhausted) {
      await tx.deadLetterJob.upsert({
        where: { originalJobId: job.id },
        create: {
          originalJobId: job.id,
          snapshot: json({ type: job.type, payload: job.payload, attempts: job.attempts }),
          reason: message,
        },
        update: { snapshot: json({ type: job.type, payload: job.payload, attempts: job.attempts }), reason: message, failedAt: new Date() },
      });
    }
  });
}

export async function runClaimedPhase4Job<T>(
  workerId: string,
  types: Phase4JobType[],
  operation: (job: BackgroundJob) => Promise<T>,
) {
  const job = await claimPhase4Job(workerId, types);
  if (!job) return null;
  try {
    const result = await operation(job);
    await completePhase4Job(job.id, workerId);
    return { jobId: job.id, result };
  } catch (error) {
    await retryPhase4Job(job, workerId, error);
    throw error;
  }
}
