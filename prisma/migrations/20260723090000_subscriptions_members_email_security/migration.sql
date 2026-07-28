-- Phase 7: subscription, member, account-email and adaptive security operations.
-- Additive only: completed Phase 2-6 lifecycle data remains intact.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

CREATE TYPE "SubscriptionEventType" AS ENUM (
  'TRIAL_STARTED',
  'PLAN_CHANGED',
  'BILLING_STATUS_CHANGED',
  'RENEWAL_SCHEDULED',
  'RENEWED',
  'SUSPENDED',
  'REACTIVATED',
  'CANCELLATION_SCHEDULED',
  'CANCELLED',
  'SEAT_ASSIGNED',
  'SEAT_RELEASED',
  'ADMIN_OVERRIDE'
);
CREATE TYPE "SubscriptionSeatStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "QuotaEnforcement" AS ENUM ('SOFT', 'HARD');
CREATE TYPE "AccessReviewStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AccessReviewDecision" AS ENUM ('PENDING', 'RETAIN', 'CHANGE_ROLE', 'SUSPEND', 'REMOVE');
CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'RETRYING', 'FAILED', 'BOUNCED', 'CANCELLED');
CREATE TYPE "EmailDeliveryAttemptStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "EmailBounceType" AS ENUM ('SOFT', 'HARD', 'COMPLAINT');
CREATE TYPE "DeviceTrustStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');
CREATE TYPE "RiskDecisionAction" AS ENUM ('ALLOW', 'CHALLENGE', 'THROTTLE', 'LOCK', 'BLOCK');
CREATE TYPE "AccountLockStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED');

ALTER TABLE "OrganizationSubscription"
  ADD COLUMN "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "renewAt" TIMESTAMP(3),
  ADD COLUMN "renewedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "reactivatedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "OrganizationSubscription"
SET "trialStartedAt" = CASE WHEN "status" = 'TRIALING' THEN "createdAt" ELSE NULL END,
    "trialEndsAt" = CASE WHEN "status" = 'TRIALING' THEN "currentPeriodEnd" ELSE NULL END,
    "renewAt" = CASE WHEN "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE') THEN "currentPeriodEnd" ELSE NULL END;

CREATE TABLE "PlanFeatureEntitlement" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "configuration" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanFeatureEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanUsageQuota" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "unit" "UsageUnit" NOT NULL,
  "limit" BIGINT NOT NULL,
  "enforcement" "QuotaEnforcement" NOT NULL DEFAULT 'HARD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanUsageQuota_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionSeat" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "status" "SubscriptionSeatStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "SubscriptionEventType" NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "parentId" TEXT,
  "managerMembershipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "managerMembershipId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMembership" (
  "teamId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("teamId", "membershipId")
);

CREATE TABLE "PermissionAudit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiatedById" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "findings" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessReview" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "AccessReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "dueAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessReviewItem" (
  "id" TEXT NOT NULL,
  "accessReviewId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "currentRoleId" TEXT,
  "proposedRoleId" TEXT,
  "decision" "AccessReviewDecision" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessReviewItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailChangeToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailTemplate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'platform',
  "key" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "branding" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "recipient" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en-AE',
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider" TEXT,
  "providerRef" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "bouncedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "EmailDeliveryAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "providerRef" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "EmailDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailBounce" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type" "EmailBounceType" NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailBounce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailAuditEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "messageId" TEXT,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerifiedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fingerprintHash" TEXT NOT NULL,
  "verificationTokenHash" TEXT,
  "verificationExpiresAt" TIMESTAMP(3),
  "label" TEXT,
  "status" "DeviceTrustStatus" NOT NULL DEFAULT 'PENDING',
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "lastIpAddress" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerifiedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdaptiveRiskDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT,
  "emailFingerprint" TEXT NOT NULL,
  "ipAddress" TEXT,
  "deviceFingerprint" TEXT,
  "score" INTEGER NOT NULL,
  "action" "RiskDecisionAction" NOT NULL,
  "reasons" TEXT[] NOT NULL,
  "metadata" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdaptiveRiskDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountLock" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "userId" TEXT NOT NULL,
  "riskDecisionId" TEXT,
  "status" "AccountLockStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "releasedById" TEXT,
  "releaseNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanFeatureEntitlement_planId_key_key" ON "PlanFeatureEntitlement"("planId", "key");
CREATE INDEX "PlanFeatureEntitlement_key_enabled_idx" ON "PlanFeatureEntitlement"("key", "enabled");
CREATE UNIQUE INDEX "PlanUsageQuota_planId_unit_key" ON "PlanUsageQuota"("planId", "unit");
CREATE INDEX "PlanUsageQuota_unit_enforcement_idx" ON "PlanUsageQuota"("unit", "enforcement");
CREATE UNIQUE INDEX "SubscriptionSeat_membershipId_key" ON "SubscriptionSeat"("membershipId");
CREATE INDEX "SubscriptionSeat_organizationId_status_idx" ON "SubscriptionSeat"("organizationId", "status");
CREATE INDEX "SubscriptionSeat_subscriptionId_status_idx" ON "SubscriptionSeat"("subscriptionId", "status");
CREATE INDEX "SubscriptionEvent_organizationId_createdAt_idx" ON "SubscriptionEvent"("organizationId", "createdAt");
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");
CREATE INDEX "SubscriptionEvent_type_createdAt_idx" ON "SubscriptionEvent"("type", "createdAt");
CREATE UNIQUE INDEX "Department_organizationId_name_key" ON "Department"("organizationId", "name");
CREATE INDEX "Department_organizationId_parentId_idx" ON "Department"("organizationId", "parentId");
CREATE INDEX "Department_managerMembershipId_idx" ON "Department"("managerMembershipId");
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");
CREATE INDEX "Team_organizationId_departmentId_idx" ON "Team"("organizationId", "departmentId");
CREATE INDEX "Team_managerMembershipId_idx" ON "Team"("managerMembershipId");
CREATE INDEX "TeamMembership_membershipId_idx" ON "TeamMembership"("membershipId");
CREATE INDEX "PermissionAudit_organizationId_createdAt_idx" ON "PermissionAudit"("organizationId", "createdAt");
CREATE INDEX "PermissionAudit_initiatedById_createdAt_idx" ON "PermissionAudit"("initiatedById", "createdAt");
CREATE INDEX "AccessReview_organizationId_status_createdAt_idx" ON "AccessReview"("organizationId", "status", "createdAt");
CREATE INDEX "AccessReview_createdById_createdAt_idx" ON "AccessReview"("createdById", "createdAt");
CREATE UNIQUE INDEX "AccessReviewItem_accessReviewId_membershipId_key" ON "AccessReviewItem"("accessReviewId", "membershipId");
CREATE INDEX "AccessReviewItem_membershipId_decision_idx" ON "AccessReviewItem"("membershipId", "decision");
CREATE INDEX "AccessReviewItem_reviewedById_reviewedAt_idx" ON "AccessReviewItem"("reviewedById", "reviewedAt");
CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE INDEX "EmailChangeToken_userId_expiresAt_idx" ON "EmailChangeToken"("userId", "expiresAt");
CREATE INDEX "EmailChangeToken_newEmail_expiresAt_idx" ON "EmailChangeToken"("newEmail", "expiresAt");
CREATE UNIQUE INDEX "EmailTemplate_scope_key_locale_key" ON "EmailTemplate"("scope", "key", "locale");
CREATE INDEX "EmailTemplate_organizationId_isActive_idx" ON "EmailTemplate"("organizationId", "isActive");
CREATE UNIQUE INDEX "EmailMessage_providerRef_key" ON "EmailMessage"("providerRef");
CREATE INDEX "EmailMessage_status_availableAt_idx" ON "EmailMessage"("status", "availableAt");
CREATE INDEX "EmailMessage_organizationId_createdAt_idx" ON "EmailMessage"("organizationId", "createdAt");
CREATE INDEX "EmailMessage_userId_createdAt_idx" ON "EmailMessage"("userId", "createdAt");
CREATE INDEX "EmailMessage_recipient_createdAt_idx" ON "EmailMessage"("recipient", "createdAt");
CREATE UNIQUE INDEX "EmailDeliveryAttempt_messageId_attempt_key" ON "EmailDeliveryAttempt"("messageId", "attempt");
CREATE INDEX "EmailDeliveryAttempt_status_startedAt_idx" ON "EmailDeliveryAttempt"("status", "startedAt");
CREATE UNIQUE INDEX "EmailBounce_providerEventId_key" ON "EmailBounce"("providerEventId");
CREATE INDEX "EmailBounce_messageId_occurredAt_idx" ON "EmailBounce"("messageId", "occurredAt");
CREATE INDEX "EmailBounce_type_occurredAt_idx" ON "EmailBounce"("type", "occurredAt");
CREATE INDEX "EmailAuditEvent_organizationId_createdAt_idx" ON "EmailAuditEvent"("organizationId", "createdAt");
CREATE INDEX "EmailAuditEvent_messageId_createdAt_idx" ON "EmailAuditEvent"("messageId", "createdAt");
CREATE INDEX "EmailAuditEvent_type_createdAt_idx" ON "EmailAuditEvent"("type", "createdAt");
CREATE UNIQUE INDEX "VerifiedDevice_userId_fingerprintHash_key" ON "VerifiedDevice"("userId", "fingerprintHash");
CREATE UNIQUE INDEX "VerifiedDevice_verificationTokenHash_key" ON "VerifiedDevice"("verificationTokenHash");
CREATE INDEX "VerifiedDevice_userId_status_idx" ON "VerifiedDevice"("userId", "status");
CREATE INDEX "VerifiedDevice_status_riskScore_idx" ON "VerifiedDevice"("status", "riskScore");
CREATE INDEX "AdaptiveRiskDecision_organizationId_createdAt_idx" ON "AdaptiveRiskDecision"("organizationId", "createdAt");
CREATE INDEX "AdaptiveRiskDecision_userId_createdAt_idx" ON "AdaptiveRiskDecision"("userId", "createdAt");
CREATE INDEX "AdaptiveRiskDecision_action_score_createdAt_idx" ON "AdaptiveRiskDecision"("action", "score", "createdAt");
CREATE INDEX "AdaptiveRiskDecision_emailFingerprint_createdAt_idx" ON "AdaptiveRiskDecision"("emailFingerprint", "createdAt");
CREATE INDEX "AccountLock_userId_status_lockedUntil_idx" ON "AccountLock"("userId", "status", "lockedUntil");
CREATE INDEX "AccountLock_organizationId_status_idx" ON "AccountLock"("organizationId", "status");
CREATE INDEX "AccountLock_riskDecisionId_idx" ON "AccountLock"("riskDecisionId");

ALTER TABLE "PlanFeatureEntitlement" ADD CONSTRAINT "PlanFeatureEntitlement_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanUsageQuota" ADD CONSTRAINT "PlanUsageQuota_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionSeat" ADD CONSTRAINT "SubscriptionSeat_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerMembershipId_fkey"
  FOREIGN KEY ("managerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerMembershipId_fkey"
  FOREIGN KEY ("managerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionAudit" ADD CONSTRAINT "PermissionAudit_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionAudit" ADD CONSTRAINT "PermissionAudit_initiatedById_fkey"
  FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_accessReviewId_fkey"
  FOREIGN KEY ("accessReviewId") REFERENCES "AccessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailChangeToken" ADD CONSTRAINT "EmailChangeToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailBounce" ADD CONSTRAINT "EmailBounce_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAuditEvent" ADD CONSTRAINT "EmailAuditEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailAuditEvent" ADD CONSTRAINT "EmailAuditEvent_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerifiedDevice" ADD CONSTRAINT "VerifiedDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdaptiveRiskDecision" ADD CONSTRAINT "AdaptiveRiskDecision_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdaptiveRiskDecision" ADD CONSTRAINT "AdaptiveRiskDecision_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdaptiveRiskDecision" ADD CONSTRAINT "AdaptiveRiskDecision_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountLock" ADD CONSTRAINT "AccountLock_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountLock" ADD CONSTRAINT "AccountLock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountLock" ADD CONSTRAINT "AccountLock_riskDecisionId_fkey"
  FOREIGN KEY ("riskDecisionId") REFERENCES "AdaptiveRiskDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountLock" ADD CONSTRAINT "AccountLock_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanUsageQuota" ADD CONSTRAINT "PlanUsageQuota_limit_check" CHECK ("limit" >= 0);
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_version_check" CHECK ("version" > 0);
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0);
ALTER TABLE "VerifiedDevice" ADD CONSTRAINT "VerifiedDevice_riskScore_check" CHECK ("riskScore" BETWEEN 0 AND 100);
ALTER TABLE "AdaptiveRiskDecision" ADD CONSTRAINT "AdaptiveRiskDecision_score_check" CHECK ("score" BETWEEN 0 AND 100);

INSERT INTO "SubscriptionSeat" ("id", "organizationId", "subscriptionId", "membershipId", "status", "assignedAt")
SELECT 'phase7-seat-' || membership."id", membership."organizationId", subscription."id", membership."id",
       'ACTIVE'::"SubscriptionSeatStatus", membership."createdAt"
FROM "Membership" AS membership
JOIN "OrganizationSubscription" AS subscription
  ON subscription."organizationId" = membership."organizationId"
WHERE membership."status" = 'ACTIVE'
ON CONFLICT ("membershipId") DO NOTHING;

INSERT INTO "SubscriptionEvent" ("id", "organizationId", "subscriptionId", "type", "reason", "metadata", "createdAt")
SELECT 'phase7-event-' || subscription."id", subscription."organizationId", subscription."id",
       'ADMIN_OVERRIDE'::"SubscriptionEventType",
       'Subscription lifecycle history initialized during the Phase 7 additive migration.',
       jsonb_build_object('status', subscription."status", 'planId', subscription."planId"),
       subscription."createdAt"
FROM "OrganizationSubscription" AS subscription;
