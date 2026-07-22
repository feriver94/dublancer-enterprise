-- Phase 6: contract completion and advanced workspace delivery evidence.
-- Additive only: completed Phase 2-5 lifecycle records and APIs remain intact.

ALTER TABLE "Contract"
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "completionNote" TEXT,
  ADD COLUMN "completionChecklist" JSONB;

ALTER TABLE "ContractAmendment"
  ADD COLUMN "baseContractVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "proposedAt" TIMESTAMP(3),
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "rowVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "ContractAmendment"
SET "baseContractVersion" = GREATEST("version", 1),
    "proposedAt" = CASE WHEN "status" = 'PROPOSED' THEN "createdAt" ELSE NULL END;

ALTER TABLE "ContractMilestone"
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT,
  ADD COLUMN "closeoutNote" TEXT;

ALTER TABLE "Review"
  ADD COLUMN "reviewerParty" "ContractAcceptanceParty",
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Review" AS review
SET "reviewerParty" = CASE
  WHEN contract."providerUserId" = review."reviewerId"
    OR EXISTS (
      SELECT 1 FROM "Membership" membership
      WHERE membership."userId" = review."reviewerId"
        AND membership."organizationId" = contract."providerOrganizationId"
        AND membership."status" = 'ACTIVE'
    )
  THEN 'PROVIDER'::"ContractAcceptanceParty"
  ELSE 'CLIENT'::"ContractAcceptanceParty"
END,
"submittedAt" = COALESCE(review."publishedAt", review."createdAt")
FROM "Contract" AS contract
WHERE contract."id" = review."contractId";

ALTER TABLE "Review" ALTER COLUMN "reviewerParty" SET NOT NULL;

ALTER TABLE "Dispute"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DisputeEvent" (
  "id" TEXT NOT NULL,
  "disputeId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "previousStatus" "DisputeStatus",
  "status" "DisputeStatus" NOT NULL,
  "note" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DisputeEvent" ("id", "disputeId", "actorUserId", "previousStatus", "status", "note", "evidence", "createdAt")
SELECT 'phase6-open-' || dispute."id", dispute."id", dispute."openedById", NULL, dispute."status",
  'Lifecycle history reconstructed from the pre-Phase 6 dispute record.', dispute."evidence", dispute."createdAt"
FROM "Dispute" AS dispute;

ALTER TABLE "TaskDependency" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Timesheet"
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Timesheet"
SET "lockedAt" = COALESCE("approvedAt", "updatedAt")
WHERE "status" = 'LOCKED';

ALTER TABLE "TimeEntry" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Deliverable"
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ChangeRequest"
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "implementedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ProjectRisk" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ProjectIssue"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ResourceAllocation"
  ADD COLUMN "allocatedById" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "ResourceAllocation" AS allocation
SET "allocatedById" = project."ownerId"
FROM "Project" AS project
WHERE project."id" = allocation."projectId";

ALTER TABLE "ResourceAllocation" ALTER COLUMN "allocatedById" SET NOT NULL;

ALTER TABLE "ProjectTemplate"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "ProjectTemplate"
SET "publishedAt" = "createdAt"
WHERE "isActive" = TRUE;

CREATE UNIQUE INDEX "ContractAmendment_one_proposed_per_contract_key"
  ON "ContractAmendment"("contractId") WHERE "status" = 'PROPOSED';
CREATE INDEX "ContractAmendment_decidedById_decidedAt_idx" ON "ContractAmendment"("decidedById", "decidedAt");
CREATE INDEX "Dispute_assignedToId_status_idx" ON "Dispute"("assignedToId", "status");
CREATE INDEX "DisputeEvent_disputeId_createdAt_idx" ON "DisputeEvent"("disputeId", "createdAt");
CREATE INDEX "DisputeEvent_actorUserId_createdAt_idx" ON "DisputeEvent"("actorUserId", "createdAt");
CREATE INDEX "Timesheet_approvedById_approvedAt_idx" ON "Timesheet"("approvedById", "approvedAt");
CREATE INDEX "Deliverable_decidedById_acceptedAt_idx" ON "Deliverable"("decidedById", "acceptedAt");
CREATE INDEX "ChangeRequest_decidedById_decidedAt_idx" ON "ChangeRequest"("decidedById", "decidedAt");
CREATE INDEX "ProjectIssue_ownerId_status_idx" ON "ProjectIssue"("ownerId", "status");
CREATE INDEX "ResourceAllocation_allocatedById_createdAt_idx" ON "ResourceAllocation"("allocatedById", "createdAt");

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DisputeEvent" ADD CONSTRAINT "DisputeEvent_disputeId_fkey"
  FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeEvent" ADD CONSTRAINT "DisputeEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectIssue" ADD CONSTRAINT "ProjectIssue_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_allocatedById_fkey"
  FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_probability_check" CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_impact_check" CHECK ("impact" BETWEEN 0 AND 100);
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_percent_check" CHECK ("allocationPercent" BETWEEN 1 AND 100);
