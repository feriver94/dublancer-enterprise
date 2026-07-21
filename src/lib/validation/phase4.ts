import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const name = z.string().trim().min(1).max(255).refine((value) => !/[\\/:*?"<>|]/.test(value), "Name contains invalid characters.");
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const uploadFields = {
  mimeType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  checksumSha256: checksum,
};

export const phase4FileQuerySchema = z.object({
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  projectId: id.optional(),
  parentId: id.nullable().optional(),
  query: z.string().trim().max(200).optional(),
  deleted: z.enum(["active", "only", "all"]).default("active"),
});

export const phase4CreateFolderSchema = z.object({
  name,
  parentId: id.optional(),
  projectId: id.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const phase4CreateUploadIntentSchema = z.object({
  name,
  parentId: id.optional(),
  projectId: id.optional(),
  ...uploadFields,
});

export const phase4CreateVersionIntentSchema = z.object({
  ...uploadFields,
  expectedFileVersion: z.number().int().nonnegative(),
  lockToken: z.string().trim().min(32).max(256).optional(),
});

export const phase4UpdateFileSchema = z.object({
  name: name.optional(),
  parentId: id.nullable().optional(),
  retentionUntil: z.coerce.date().nullable().optional(),
  legalHold: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  deleted: z.boolean().optional(),
  lockToken: z.string().trim().min(32).max(256).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "lockToken"), "At least one file field must be provided.");

export const phase4LockFileSchema = z.object({ expiresInMinutes: z.number().int().min(1).max(1440).default(30) });
export const phase4UnlockFileSchema = z.object({ lockToken: z.string().trim().min(32).max(256) });

export const phase4SearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  entityType: z.enum(["all", "project", "listing", "contract", "file"]).default("all"),
  projectId: id.optional(),
  locale: z.enum(["en-AE", "ar-AE"]).optional(),
  cursor: z.string().trim().min(1).max(1000).optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const phase4ReindexSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(128) });

export const phase4AnalyticsSummarySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
  metric: z.string().trim().min(1).max(100).optional(),
  dimensionKey: z.string().trim().min(1).max(200).optional(),
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
});

export const phase4AnalyticsBackfillSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const phase4WorkerSchema = z.object({
  workerId: z.string().trim().min(3).max(128),
  action: z.enum(["PROCESS", "SCHEDULE"]).default("PROCESS"),
  organizationId: id.optional(),
});

export const governedProjectAttachmentSchema = z.object({
  fileVersionId: id,
  taskId: id.optional(),
});
