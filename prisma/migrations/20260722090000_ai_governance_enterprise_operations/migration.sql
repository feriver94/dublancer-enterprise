-- Phase 5: governed AI administration and shared enterprise background operations.
-- Additive only: completed Phase 2, Phase 3, and Phase 4 lifecycle data is preserved.

CREATE TYPE "AiBudgetReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');
CREATE TYPE "BackgroundJobAttemptStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'LEASE_LOST', 'CANCELLED');

ALTER TABLE "AiTenantConfig"
  ADD COLUMN "monthlyCostBudgetMinor" BIGINT,
  ADD COLUMN "maxTokensPerRun" INTEGER NOT NULL DEFAULT 4096,
  ADD COLUMN "maxCostPerRunMinor" BIGINT,
  ADD COLUMN "maxInputBytes" INTEGER NOT NULL DEFAULT 65536,
  ADD COLUMN "allowedModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "allowedProviderKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "DataExportJob"
  ADD COLUMN "format" TEXT NOT NULL DEFAULT 'JSON',
  ADD COLUMN "rowCount" INTEGER,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "BackgroundJob"
  ADD COLUMN "queue" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "lastStartedAt" TIMESTAMP(3),
  ADD COLUMN "scheduleId" TEXT;

ALTER TABLE "DeadLetterJob"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "recoveryCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AiBudgetReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "tokenBudget" INTEGER NOT NULL,
  "costBudgetMinor" BIGINT NOT NULL DEFAULT 0,
  "status" "AiBudgetReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "settledTokens" INTEGER,
  "settledCostMinor" BIGINT,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiBudgetReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataExportArtifact" (
  "id" TEXT NOT NULL,
  "exportJobId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataExportArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundJobAttempt" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "workerId" TEXT NOT NULL,
  "leaseToken" TEXT NOT NULL,
  "status" "BackgroundJobAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "diagnostics" JSONB,
  CONSTRAINT "BackgroundJobAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSchedule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "key" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "queue" TEXT NOT NULL DEFAULT 'default',
  "payload" JSONB NOT NULL,
  "intervalSeconds" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastEnqueuedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerHeartbeat" (
  "workerId" TEXT NOT NULL,
  "organizationId" TEXT,
  "queues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" TEXT,
  "hostname" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "currentJobId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

CREATE UNIQUE INDEX "AiBudgetReservation_runId_key" ON "AiBudgetReservation"("runId");
CREATE INDEX "AiBudgetReservation_organizationId_status_createdAt_idx" ON "AiBudgetReservation"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "DataExportArtifact_exportJobId_key" ON "DataExportArtifact"("exportJobId");
CREATE INDEX "DataExportArtifact_createdAt_idx" ON "DataExportArtifact"("createdAt");
CREATE UNIQUE INDEX "BackgroundJobAttempt_jobId_attemptNumber_key" ON "BackgroundJobAttempt"("jobId", "attemptNumber");
CREATE INDEX "BackgroundJobAttempt_workerId_startedAt_idx" ON "BackgroundJobAttempt"("workerId", "startedAt");
CREATE INDEX "BackgroundJobAttempt_status_heartbeatAt_idx" ON "BackgroundJobAttempt"("status", "heartbeatAt");
CREATE UNIQUE INDEX "JobSchedule_key_key" ON "JobSchedule"("key");
CREATE INDEX "JobSchedule_enabled_nextRunAt_idx" ON "JobSchedule"("enabled", "nextRunAt");
CREATE INDEX "JobSchedule_organizationId_enabled_nextRunAt_idx" ON "JobSchedule"("organizationId", "enabled", "nextRunAt");
CREATE INDEX "WorkerHeartbeat_organizationId_lastSeenAt_idx" ON "WorkerHeartbeat"("organizationId", "lastSeenAt");
CREATE INDEX "WorkerHeartbeat_status_lastSeenAt_idx" ON "WorkerHeartbeat"("status", "lastSeenAt");
CREATE INDEX "BackgroundJob_queue_status_priority_availableAt_idx" ON "BackgroundJob"("queue", "status", "priority", "availableAt");
CREATE INDEX "BackgroundJob_scheduleId_idx" ON "BackgroundJob"("scheduleId");

ALTER TABLE "AiBudgetReservation" ADD CONSTRAINT "AiBudgetReservation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiBudgetReservation" ADD CONSTRAINT "AiBudgetReservation_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataExportArtifact" ADD CONSTRAINT "DataExportArtifact_exportJobId_fkey"
  FOREIGN KEY ("exportJobId") REFERENCES "DataExportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJobAttempt" ADD CONSTRAINT "BackgroundJobAttempt_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSchedule" ADD CONSTRAINT "JobSchedule_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerHeartbeat" ADD CONSTRAINT "WorkerHeartbeat_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "JobSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Register new privileged actions and grant them only to existing Owner/Admin roles.
INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES
  ('phase5-permission-ai-approve', 'ai.approve', 'Approve or reject governed AI execution.', CURRENT_TIMESTAMP),
  ('phase5-permission-security-manage', 'security.events.manage', 'Resolve and annotate security events.', CURRENT_TIMESTAMP),
  ('phase5-permission-operations-manage', 'platform.operations.manage', 'Retry, cancel, recover, and schedule background work.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role
JOIN "Permission" AS permission ON permission."key" IN ('ai.approve', 'security.events.manage', 'platform.operations.manage')
WHERE role."name" IN ('Owner', 'Admin')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
