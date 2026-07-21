import type { BackgroundJob } from "@prisma/client";
import {
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  runClaimedJob,
  type ClaimedJob,
} from "@/lib/jobs/worker-runtime.service";

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
  return enqueueJob({ ...input, queue: "phase4", maxAttempts: input.maxAttempts ?? 8 });
}

export async function claimPhase4Job(workerId: string, types: Phase4JobType[]) {
  return claimJob({ workerId, types, queues: ["phase4", "default"] });
}

export async function completePhase4Job(claim: ClaimedJob) {
  return completeJob(claim);
}

export async function retryPhase4Job(claim: ClaimedJob, error: unknown) {
  return failJob(claim, error);
}

export async function runClaimedPhase4Job<T>(
  workerId: string,
  types: Phase4JobType[],
  operation: (job: BackgroundJob) => Promise<T>,
) {
  return runClaimedJob({ workerId, types, queues: ["phase4", "default"] }, operation);
}
