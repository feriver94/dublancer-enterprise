-- Phase 2: governed marketplace award, contract execution, and financial settlement.

CREATE TYPE "ContractAcceptanceParty" AS ENUM ('CLIENT', 'PROVIDER');
CREATE TYPE "ContractAcceptanceMethod" AS ENUM ('CLICKWRAP', 'ELECTRONIC_SIGNATURE');
CREATE TYPE "SubmissionDecisionType" AS ENUM ('APPROVED', 'REJECTED', 'REVISION_REQUESTED');
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

ALTER TABLE "MarketplaceListing"
  ADD COLUMN "awardedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Proposal"
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "providerOrganizationId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Proposal" AS proposal
SET "providerOrganizationId" = (
  SELECT membership."organizationId"
  FROM "Membership" AS membership
  JOIN "MarketplaceListing" AS listing ON listing."id" = proposal."listingId"
  WHERE membership."userId" = proposal."submittedById"
    AND membership."status" = 'ACTIVE'
    AND membership."organizationId" <> listing."organizationId"
  ORDER BY membership."createdAt" ASC, membership."id" ASC
  LIMIT 1
);

ALTER TABLE "Contract"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ContractMilestone"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WorkSubmission"
  ADD COLUMN "revision" INTEGER,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "contractMilestoneId"
    ORDER BY "createdAt" ASC, "id" ASC
  ) AS revision
  FROM "WorkSubmission"
)
UPDATE "WorkSubmission" AS submission
SET "revision" = ranked.revision
FROM ranked
WHERE submission."id" = ranked."id";

ALTER TABLE "WorkSubmission"
  ALTER COLUMN "revision" SET NOT NULL,
  ALTER COLUMN "revision" SET DEFAULT 1;

ALTER TABLE "Invoice"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "FinancialTransaction"
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureMessage" TEXT,
  ADD COLUMN "processedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Refund"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "refundTransactionId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Refund" AS refund
SET
  "organizationId" = transaction."organizationId",
  "idempotencyKey" = CONCAT('legacy-refund:', refund."id")
FROM "FinancialTransaction" AS transaction
WHERE refund."transactionId" = transaction."id";

ALTER TABLE "Refund"
  ALTER COLUMN "organizationId" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

ALTER TABLE "ReconciliationRecord"
  ADD COLUMN "eventCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReconciledAt" TIMESTAMP(3);

ALTER TABLE "WebhookReceipt"
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "providerRef" TEXT,
  ADD COLUMN "transactionId" TEXT,
  ADD COLUMN "refundId" TEXT,
  ADD COLUMN "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED';

CREATE TABLE "ContractAcceptance" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "party" "ContractAcceptanceParty" NOT NULL,
  "acceptedById" TEXT NOT NULL,
  "organizationId" TEXT,
  "termsHash" TEXT NOT NULL,
  "method" "ContractAcceptanceMethod" NOT NULL DEFAULT 'CLICKWRAP',
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractAcceptance_termsHash_check" CHECK (char_length("termsHash") = 64)
);

CREATE TABLE "WorkSubmissionDecision" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "decision" "SubmissionDecisionType" NOT NULL,
  "decidedById" TEXT NOT NULL,
  "note" TEXT,
  "previousStatus" "SubmissionStatus" NOT NULL,
  "resultingStatus" "SubmissionStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkSubmissionDecision_pkey" PRIMARY KEY ("id")
);

DROP INDEX IF EXISTS "FinancialTransaction_providerKey_providerRef_idx";

CREATE UNIQUE INDEX "Contract_listingId_key" ON "Contract"("listingId");
CREATE INDEX "Proposal_decidedById_decidedAt_idx" ON "Proposal"("decidedById", "decidedAt");
CREATE INDEX "Proposal_providerOrganizationId_status_updatedAt_idx" ON "Proposal"("providerOrganizationId", "status", "updatedAt");
CREATE UNIQUE INDEX "ContractAcceptance_contractId_party_key" ON "ContractAcceptance"("contractId", "party");
CREATE INDEX "ContractAcceptance_acceptedById_acceptedAt_idx" ON "ContractAcceptance"("acceptedById", "acceptedAt");
CREATE INDEX "ContractAcceptance_organizationId_acceptedAt_idx" ON "ContractAcceptance"("organizationId", "acceptedAt");
CREATE UNIQUE INDEX "WorkSubmission_contractMilestoneId_revision_key" ON "WorkSubmission"("contractMilestoneId", "revision");
CREATE UNIQUE INDEX "WorkSubmission_active_submission_key"
  ON "WorkSubmission"("contractMilestoneId")
  WHERE "status" IN ('SUBMITTED', 'IN_REVIEW');
CREATE UNIQUE INDEX "WorkSubmissionDecision_submissionId_key" ON "WorkSubmissionDecision"("submissionId");
CREATE INDEX "WorkSubmissionDecision_decidedById_createdAt_idx" ON "WorkSubmissionDecision"("decidedById", "createdAt");
CREATE UNIQUE INDEX "FinancialTransaction_providerKey_providerRef_key" ON "FinancialTransaction"("providerKey", "providerRef");
CREATE UNIQUE INDEX "PaymentSchedule_contractMilestoneId_key" ON "PaymentSchedule"("contractMilestoneId");
CREATE UNIQUE INDEX "Refund_refundTransactionId_key" ON "Refund"("refundTransactionId");
CREATE UNIQUE INDEX "Refund_organizationId_idempotencyKey_key" ON "Refund"("organizationId", "idempotencyKey");
CREATE INDEX "Refund_organizationId_status_createdAt_idx" ON "Refund"("organizationId", "status", "createdAt");
CREATE INDEX "WebhookReceipt_providerKey_providerRef_idx" ON "WebhookReceipt"("providerKey", "providerRef");
CREATE INDEX "WebhookReceipt_processingStatus_receivedAt_idx" ON "WebhookReceipt"("processingStatus", "receivedAt");

ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_providerOrganizationId_fkey"
  FOREIGN KEY ("providerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractAcceptance"
  ADD CONSTRAINT "ContractAcceptance_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractAcceptance"
  ADD CONSTRAINT "ContractAcceptance_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractAcceptance"
  ADD CONSTRAINT "ContractAcceptance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkSubmissionDecision"
  ADD CONSTRAINT "WorkSubmissionDecision_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "WorkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkSubmissionDecision"
  ADD CONSTRAINT "WorkSubmissionDecision_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_refundTransactionId_fkey"
  FOREIGN KEY ("refundTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebhookReceipt"
  ADD CONSTRAINT "WebhookReceipt_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebhookReceipt"
  ADD CONSTRAINT "WebhookReceipt_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amountMinor_check" CHECK ("amountMinor" > 0);
