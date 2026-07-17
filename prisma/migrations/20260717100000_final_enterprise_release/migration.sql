-- CreateEnum
CREATE TYPE "WorkGraphNodeType" AS ENUM ('USER', 'ORGANIZATION', 'PROJECT', 'LISTING', 'CONTRACT', 'SKILL', 'FILE', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "WorkGraphEdgeType" AS ENUM ('OWNS', 'MEMBER_OF', 'REQUIRES', 'MATCHES', 'DELIVERS', 'REFERENCES', 'GENERATED_BY', 'RELATED_TO');

-- CreateEnum
CREATE TYPE "WorkflowDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkflowApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TalentMatchStatus" AS ENUM ('SUGGESTED', 'SHORTLISTED', 'DISMISSED', 'CONTACTED', 'HIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileActivityType" ADD VALUE 'SCANNED';
ALTER TYPE "FileActivityType" ADD VALUE 'QUARANTINED';

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "currency" SET DEFAULT 'AED';

-- AlterTable
ALTER TABLE "OrganizationSettings" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Dubai',
ALTER COLUMN "defaultCurrency" SET DEFAULT 'AED',
ALTER COLUMN "dataRegion" SET DEFAULT 'UAE';

-- CreateTable
CREATE TABLE "WorkGraphNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "WorkGraphNodeType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "properties" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkGraphEdge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "type" "WorkGraphEdgeType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "activeVersion" INTEGER,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 10,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 3600,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "timeoutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "config" JSONB,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepRunId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decision" "WorkflowApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "expiresAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentMatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "freelancerProfileId" TEXT NOT NULL,
    "status" "TalentMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "score" INTEGER NOT NULL,
    "skillScore" INTEGER NOT NULL,
    "experienceScore" INTEGER NOT NULL,
    "availabilityScore" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "excludedAttributes" TEXT[] DEFAULT ARRAY['displayName', 'email', 'gender', 'age', 'nationality', 'religion', 'disability', 'maritalStatus']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkGraphNode_organizationId_type_isActive_idx" ON "WorkGraphNode"("organizationId", "type", "isActive");

-- CreateIndex
CREATE INDEX "WorkGraphNode_projectId_type_idx" ON "WorkGraphNode"("projectId", "type");

-- CreateIndex
CREATE INDEX "WorkGraphNode_fingerprint_idx" ON "WorkGraphNode"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "WorkGraphNode_organizationId_type_externalId_key" ON "WorkGraphNode"("organizationId", "type", "externalId");

-- CreateIndex
CREATE INDEX "WorkGraphEdge_organizationId_type_idx" ON "WorkGraphEdge"("organizationId", "type");

-- CreateIndex
CREATE INDEX "WorkGraphEdge_fromNodeId_type_idx" ON "WorkGraphEdge"("fromNodeId", "type");

-- CreateIndex
CREATE INDEX "WorkGraphEdge_toNodeId_type_idx" ON "WorkGraphEdge"("toNodeId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WorkGraphEdge_organizationId_fromNodeId_toNodeId_type_key" ON "WorkGraphEdge"("organizationId", "fromNodeId", "toNodeId", "type");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_organizationId_status_updatedAt_idx" ON "WorkflowDefinition"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_createdById_createdAt_idx" ON "WorkflowDefinition"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_organizationId_key_key" ON "WorkflowDefinition"("organizationId", "key");

-- CreateIndex
CREATE INDEX "WorkflowVersion_checksum_idx" ON "WorkflowVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_definitionId_version_key" ON "WorkflowVersion"("definitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_definitionId_checksum_key" ON "WorkflowVersion"("definitionId", "checksum");

-- CreateIndex
CREATE INDEX "WorkflowRun_organizationId_status_availableAt_idx" ON "WorkflowRun"("organizationId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_definitionId_status_createdAt_idx" ON "WorkflowRun"("definitionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_correlationId_idx" ON "WorkflowRun"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_organizationId_definitionId_idempotencyKey_key" ON "WorkflowRun"("organizationId", "definitionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_status_availableAt_idx" ON "WorkflowStepRun"("status", "availableAt");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_runId_status_idx" ON "WorkflowStepRun"("runId", "status");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_lockedAt_idx" ON "WorkflowStepRun"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepRun_runId_stepKey_key" ON "WorkflowStepRun"("runId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowApproval_stepRunId_key" ON "WorkflowApproval"("stepRunId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_organizationId_decision_createdAt_idx" ON "WorkflowApproval"("organizationId", "decision", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowApproval_runId_decision_idx" ON "WorkflowApproval"("runId", "decision");

-- CreateIndex
CREATE INDEX "WorkflowApproval_expiresAt_idx" ON "WorkflowApproval"("expiresAt");

-- CreateIndex
CREATE INDEX "TalentMatch_organizationId_status_score_idx" ON "TalentMatch"("organizationId", "status", "score");

-- CreateIndex
CREATE INDEX "TalentMatch_listingId_score_idx" ON "TalentMatch"("listingId", "score");

-- CreateIndex
CREATE INDEX "TalentMatch_freelancerProfileId_status_idx" ON "TalentMatch"("freelancerProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TalentMatch_organizationId_listingId_freelancerProfileId_key" ON "TalentMatch"("organizationId", "listingId", "freelancerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE INDEX "RateLimitBucket_organizationId_expiresAt_idx" ON "RateLimitBucket"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "WorkGraphNode" ADD CONSTRAINT "WorkGraphNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGraphNode" ADD CONSTRAINT "WorkGraphNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGraphEdge" ADD CONSTRAINT "WorkGraphEdge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGraphEdge" ADD CONSTRAINT "WorkGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "WorkGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGraphEdge" ADD CONSTRAINT "WorkGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "WorkGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_stepRunId_fkey" FOREIGN KEY ("stepRunId") REFERENCES "WorkflowStepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentMatch" ADD CONSTRAINT "TalentMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentMatch" ADD CONSTRAINT "TalentMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentMatch" ADD CONSTRAINT "TalentMatch_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Final enterprise permission matrix. Existing custom roles remain unchanged.
INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES
  ('perm_orchestration_read', 'orchestration.read', 'View governed workflow definitions, runs, and approvals.', CURRENT_TIMESTAMP),
  ('perm_orchestration_manage', 'orchestration.manage', 'Create and publish governed workflow definitions.', CURRENT_TIMESTAMP),
  ('perm_orchestration_run', 'orchestration.run', 'Start governed workflow runs.', CURRENT_TIMESTAMP),
  ('perm_orchestration_approve', 'orchestration.approve', 'Approve or reject governed workflow gates.', CURRENT_TIMESTAMP),
  ('perm_workgraph_read', 'workgraph.read', 'View the tenant-isolated work graph.', CURRENT_TIMESTAMP),
  ('perm_workgraph_manage', 'workgraph.manage', 'Rebuild the tenant-isolated work graph.', CURRENT_TIMESTAMP),
  ('perm_matching_manage', 'matching.manage', 'Generate and review explainable talent matches.', CURRENT_TIMESTAMP),
  ('perm_billing_manage', 'billing.manage', 'Manage subscription, usage, and billing controls.', CURRENT_TIMESTAMP),
  ('perm_moderation_manage', 'moderation.manage', 'Manage marketplace reports, moderation, and disputes.', CURRENT_TIMESTAMP),
  ('perm_compliance_manage', 'compliance.manage', 'Manage retention, consent, and compliance policy.', CURRENT_TIMESTAMP),
  ('perm_platform_operations_read', 'platform.operations.read', 'View operational readiness and provider health.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" IN ('Owner', 'Admin') AND p."key" IN (
  'orchestration.read','orchestration.manage','orchestration.run','orchestration.approve',
  'workgraph.read','workgraph.manage','matching.manage','billing.manage','moderation.manage',
  'compliance.manage','platform.operations.read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Manager' AND p."key" IN (
  'orchestration.read','orchestration.run','orchestration.approve','workgraph.read',
  'matching.manage','billing.manage','moderation.manage','platform.operations.read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Member' AND p."key" IN ('orchestration.read','orchestration.run','workgraph.read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Viewer' AND p."key" IN ('orchestration.read','workgraph.read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
