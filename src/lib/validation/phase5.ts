import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const jsonObject = z.record(z.string(), z.unknown());

export const aiRunListSchema = z.object({
  status: z.enum(["PENDING_APPROVAL", "QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const aiApprovalListSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).optional(),
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const aiPromptSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,99}$/i),
  name: z.string().trim().min(2).max(200),
  useCase: z.string().trim().min(2).max(100),
  systemTemplate: z.string().trim().min(10).max(50_000),
  userTemplate: z.string().trim().min(2).max(50_000),
  variables: jsonObject.optional(),
  safetyPolicy: jsonObject.optional(),
});

export const aiPromptVersionSchema = aiPromptSchema.pick({ systemTemplate: true, userTemplate: true, variables: true, safetyPolicy: true }).extend({ activate: z.boolean().default(false) });
export const aiRetrySchema = z.object({ idempotencyKey: z.string().trim().min(8).max(128) });
export const aiCancelSchema = z.object({ reason: z.string().trim().min(2).max(2_000).optional() });
export const aiUsageSchema = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });

export const jobListSchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DEAD_LETTER", "CANCELLED"]).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  queue: z.string().trim().min(1).max(100).optional(),
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const jobActionSchema = z.object({ reason: z.string().trim().min(2).max(2_000).optional() });

export const jobScheduleSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9:._-]{2,190}$/i),
  jobType: z.enum(["SEARCH_INCREMENTAL", "RETENTION_ENFORCE", "NOTIFICATION_DELIVERY"]),
  queue: z.string().trim().min(1).max(100).default("operations"),
  payload: jsonObject.default({}),
  intervalSeconds: z.number().int().min(60).max(31_536_000),
  priority: z.number().int().min(1).max(1_000).default(100),
  maxAttempts: z.number().int().min(1).max(100).default(10),
  enabled: z.boolean().default(true),
  nextRunAt: z.coerce.date(),
});

export const jobScheduleUpdateSchema = jobScheduleSchema.omit({ key: true }).partial().refine((value) => Object.keys(value).length > 0, "At least one schedule field is required.");

export const workerRuntimeSchema = z.object({
  workerId: z.string().trim().min(3).max(128),
  action: z.enum(["PROCESS", "SCHEDULE", "CLAIM", "HEARTBEAT", "COMPLETE", "FAIL"]).default("PROCESS"),
  jobId: id.optional(),
  leaseToken: z.string().uuid().optional(),
  types: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  queues: z.array(z.string().trim().min(1).max(100)).max(20).default(["operations"]),
  version: z.string().trim().max(100).optional(),
  hostname: z.string().trim().max(255).optional(),
  diagnostics: z.unknown().optional(),
  errorCode: z.string().trim().min(1).max(100).optional(),
  errorMessage: z.string().trim().min(1).max(2_000).optional(),
});

export const exportListSchema = z.object({
  status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED"]).optional(),
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const supportCaseUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: id.nullable().optional(),
  resolution: z.string().trim().min(2).max(10_000).nullable().optional(),
});

export const securityEventUpdateSchema = z.object({
  resolved: z.boolean(),
  note: z.string().trim().min(2).max(5_000).optional(),
});
