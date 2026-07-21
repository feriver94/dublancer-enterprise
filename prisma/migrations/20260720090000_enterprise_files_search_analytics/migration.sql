-- Phase 4: governed enterprise files, production search indexing, and analytics aggregation.
-- This migration is additive and preserves all Phase 2 and Phase 3 lifecycle data.

CREATE TYPE "FileUploadIntentStatus" AS ENUM ('ISSUED', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "AnalyticsAggregationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "ProjectAttachment"
  ADD COLUMN "fileVersionId" TEXT;

ALTER TABLE "FileVersion"
  ADD COLUMN "uploadIntentId" TEXT;

ALTER TABLE "SearchDocument"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "fileNodeId" TEXT,
  ADD COLUMN "requiredPermission" TEXT,
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "generation" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BackgroundJob"
  ADD COLUMN "deduplicationKey" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE TABLE "FileUploadIntent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT,
  "parentId" TEXT,
  "fileNodeId" TEXT,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" "FileUploadIntentStatus" NOT NULL DEFAULT 'ISSUED',
  "expectedFileVersion" INTEGER NOT NULL DEFAULT 0,
  "providerReference" TEXT,
  "providerEvidence" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FileUploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchIndexCheckpoint" (
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "lastIncrementalAt" TIMESTAMP(3),
  "lastFullReindexAt" TIMESTAMP(3),
  "lastIndexedAt" TIMESTAMP(3),
  "documentCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SearchIndexCheckpoint_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "AnalyticsAggregationRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT,
  "rangeStart" TIMESTAMP(3) NOT NULL,
  "rangeEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "status" "AnalyticsAggregationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "processedEventCount" INTEGER NOT NULL DEFAULT 0,
  "metricCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsAggregationRun_pkey" PRIMARY KEY ("id")
);

-- Bind any legacy attachment that already points at a governed storage object.
UPDATE "ProjectAttachment" AS attachment
SET "fileVersionId" = version."id"
FROM "FileVersion" AS version
WHERE attachment."storageKey" = version."storageKey"
  AND attachment."fileVersionId" IS NULL;

-- Safely quarantine metadata-only legacy attachments inside the governed lifecycle.
-- They remain non-downloadable until explicitly re-uploaded and scanned.
INSERT INTO "FileNode" (
  "id", "organizationId", "projectId", "parentId", "createdById", "type", "name",
  "currentVersionNumber", "inheritedPermissions", "legalHold", "metadata", "createdAt", "updatedAt"
)
SELECT
  'legacy-node-' || attachment."id",
  project."organizationId",
  attachment."projectId",
  NULL,
  attachment."uploadedById",
  'FILE'::"FileNodeType",
  LEFT(attachment."filename", 225) || ' (legacy ' || LEFT(attachment."id", 8) || ')',
  1,
  TRUE,
  FALSE,
  jsonb_build_object('legacyAttachmentId', attachment."id", 'originalFilename', attachment."filename", 'verification', 'UNVERIFIED'),
  attachment."createdAt",
  attachment."createdAt"
FROM "ProjectAttachment" AS attachment
JOIN "Project" AS project ON project."id" = attachment."projectId"
WHERE attachment."fileVersionId" IS NULL;

INSERT INTO "FileVersion" (
  "id", "fileNodeId", "uploadedById", "version", "storageProvider", "storageKey",
  "mimeType", "sizeBytes", "checksumSha256", "scanStatus", "createdAt"
)
SELECT
  'legacy-version-' || attachment."id",
  'legacy-node-' || attachment."id",
  attachment."uploadedById",
  1,
  'legacy-unverified',
  attachment."storageKey",
  attachment."mimeType",
  attachment."sizeBytes",
  COALESCE(LOWER(attachment."checksumSha256"), REPEAT('0', 64)),
  'NOT_CONFIGURED'::"FileScanStatus",
  attachment."createdAt"
FROM "ProjectAttachment" AS attachment
WHERE attachment."fileVersionId" IS NULL;

UPDATE "ProjectAttachment"
SET "fileVersionId" = 'legacy-version-' || "id"
WHERE "fileVersionId" IS NULL;

ALTER TABLE "ProjectAttachment"
  ALTER COLUMN "fileVersionId" SET NOT NULL;

-- PostgreSQL NULL semantics do not protect duplicate root names with the existing composite key.
WITH duplicate_roots AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organizationId", "name"
    ORDER BY "createdAt", "id"
  ) AS ordinal
  FROM "FileNode"
  WHERE "parentId" IS NULL
)
UPDATE "FileNode" AS node
SET "name" = LEFT(node."name", 235) || ' (' || LEFT(node."id", 8) || ')'
FROM duplicate_roots
WHERE duplicate_roots."id" = node."id" AND duplicate_roots.ordinal > 1;

ALTER TABLE "SearchDocument" ALTER COLUMN "sourceUpdatedAt" DROP DEFAULT;
ALTER TABLE "SearchDocument" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "ProjectAttachment_fileVersionId_key" ON "ProjectAttachment"("fileVersionId");
CREATE UNIQUE INDEX "FileVersion_uploadIntentId_key" ON "FileVersion"("uploadIntentId");
CREATE UNIQUE INDEX "FileUploadIntent_storageKey_key" ON "FileUploadIntent"("storageKey");
CREATE UNIQUE INDEX "FileNode_organization_root_name_key" ON "FileNode"("organizationId", "name") WHERE "parentId" IS NULL;
CREATE INDEX "FileUploadIntent_organizationId_status_expiresAt_idx" ON "FileUploadIntent"("organizationId", "status", "expiresAt");
CREATE INDEX "FileUploadIntent_fileNodeId_status_createdAt_idx" ON "FileUploadIntent"("fileNodeId", "status", "createdAt");
CREATE INDEX "FileUploadIntent_createdById_createdAt_idx" ON "FileUploadIntent"("createdById", "createdAt");

CREATE INDEX "SearchDocument_organizationId_projectId_deletedAt_idx" ON "SearchDocument"("organizationId", "projectId", "deletedAt");
CREATE INDEX "SearchDocument_organizationId_requiredPermission_deletedAt_idx" ON "SearchDocument"("organizationId", "requiredPermission", "deletedAt");
CREATE INDEX "SearchDocument_fileNodeId_idx" ON "SearchDocument"("fileNodeId");
CREATE INDEX "SearchIndexCheckpoint_status_updatedAt_idx" ON "SearchIndexCheckpoint"("status", "updatedAt");

ALTER TABLE "SearchDocument" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE("title", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE("body", '')), 'B')
  ) STORED;
CREATE INDEX "SearchDocument_searchVector_idx" ON "SearchDocument" USING GIN ("searchVector");

CREATE UNIQUE INDEX "AnalyticsAggregationRun_organizationId_idempotencyKey_key" ON "AnalyticsAggregationRun"("organizationId", "idempotencyKey");
CREATE INDEX "AnalyticsAggregationRun_organizationId_status_createdAt_idx" ON "AnalyticsAggregationRun"("organizationId", "status", "createdAt");
CREATE INDEX "AnalyticsAggregationRun_organizationId_rangeStart_rangeEnd_idx" ON "AnalyticsAggregationRun"("organizationId", "rangeStart", "rangeEnd");

CREATE UNIQUE INDEX "BackgroundJob_deduplicationKey_key" ON "BackgroundJob"("deduplicationKey");
CREATE INDEX "BackgroundJob_status_leaseExpiresAt_idx" ON "BackgroundJob"("status", "leaseExpiresAt");

ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_fileVersionId_fkey"
  FOREIGN KEY ("fileVersionId") REFERENCES "FileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_uploadIntentId_fkey"
  FOREIGN KEY ("uploadIntentId") REFERENCES "FileUploadIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileUploadIntent" ADD CONSTRAINT "FileUploadIntent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileUploadIntent" ADD CONSTRAINT "FileUploadIntent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileUploadIntent" ADD CONSTRAINT "FileUploadIntent_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileUploadIntent" ADD CONSTRAINT "FileUploadIntent_fileNodeId_fkey"
  FOREIGN KEY ("fileNodeId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileUploadIntent" ADD CONSTRAINT "FileUploadIntent_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_fileNodeId_fkey"
  FOREIGN KEY ("fileNodeId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchIndexCheckpoint" ADD CONSTRAINT "SearchIndexCheckpoint_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsAggregationRun" ADD CONSTRAINT "AnalyticsAggregationRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsAggregationRun" ADD CONSTRAINT "AnalyticsAggregationRun_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
