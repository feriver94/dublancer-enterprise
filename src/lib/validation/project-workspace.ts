import { z } from "zod";

export const addProjectMemberSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"]).default("CONTRIBUTOR"),
});

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  dueAt: z.coerce.date().optional(),
});

export const createTaskSchema = z.object({
  milestoneId: z.string().trim().min(1).optional(),
  assigneeId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(12000).optional(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueAt: z.coerce.date().optional(),
  position: z.coerce.number().int().min(0).default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one task field must be provided." },
);

export const createCommentSchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).max(12000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createAttachmentSchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).max(255),
  storageKey: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.bigint().positive(),
  checksumSha256: z.string().trim().length(64).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});
