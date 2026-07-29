-- Phase 9: enterprise CRM, talent, knowledge, and integration operations.
-- This migration is chronological and additive; no completed-phase object is removed.

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "CrmAccountStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'CHURNED');

-- CreateEnum
CREATE TYPE "CrmOpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmStageCategory" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CrmQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CrmCustomerHealthBand" AS ENUM ('HEALTHY', 'WATCH', 'AT_RISK', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TalentProfileStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TalentProficiencyLevel" AS ENUM ('FOUNDATION', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "TalentCertificationStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ResourcePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffingRequirementStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffingAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TalentAvailabilityStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TalentBenchStatus" AS ENUM ('ON_BENCH', 'PARTIALLY_ALLOCATED', 'ASSIGNED', 'EXITED');

-- CreateEnum
CREATE TYPE "TalentPerformanceRating" AS ENUM ('BELOW_EXPECTATIONS', 'MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS', 'EXCEPTIONAL');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntegrationConnectorType" AS ENUM ('REST', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "IntegrationAuthType" AS ENUM ('NONE', 'API_KEY', 'BEARER', 'BASIC', 'OAUTH2');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OAuthIntegrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REFRESH_REQUIRED', 'REVOKED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationWebhookStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'PARTIAL', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "IntegrationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYING', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "IntegrationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntegrationAttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "CrmPipeline" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "category" "CrmStageCategory" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedToMembershipId" TEXT,
    "source" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "convertedAt" TIMESTAMP(3),
    "convertedAccountId" TEXT,
    "convertedContactId" TEXT,
    "convertedOpportunityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerMembershipId" TEXT,
    "parentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "status" "CrmAccountStatus" NOT NULL DEFAULT 'PROSPECT',
    "industry" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "annualRevenueMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "externalReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ownerMembershipId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerMembershipId" TEXT,
    "name" TEXT NOT NULL,
    "status" "CrmOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "leadId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "leadId" TEXT,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmQuote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "createdById" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "CrmQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "terms" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomerHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "CrmCustomerHealthBand" NOT NULL,
    "signals" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RULE_ENGINE',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCustomerHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomerMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCustomerMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "TalentProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "hireDate" TIMESTAMP(3),
    "costRateMinor" BIGINT,
    "billRateMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "targetUtilizationPercent" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentProfileSkill" (
    "talentProfileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" "TalentProficiencyLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "endorsedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentProfileSkill_pkey" PRIMARY KEY ("talentProfileId","skillId")
);

-- CreateTable
CREATE TABLE "TalentCertification" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "status" "TalentCertificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourcePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ResourcePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "budgetHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourcePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingRequirement" (
    "id" TEXT NOT NULL,
    "resourcePlanId" TEXT NOT NULL,
    "skillId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "requiredProfiles" INTEGER NOT NULL DEFAULT 1,
    "filledProfiles" INTEGER NOT NULL DEFAULT 0,
    "hoursPerWeek" INTEGER NOT NULL DEFAULT 40,
    "minProficiency" "TalentProficiencyLevel",
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "StaffingRequirementStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourcePlanId" TEXT NOT NULL,
    "requirementId" TEXT,
    "talentProfileId" TEXT NOT NULL,
    "projectId" TEXT,
    "allocatedById" TEXT NOT NULL,
    "allocationPercent" INTEGER NOT NULL,
    "hoursPerWeek" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "StaffingAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentAvailability" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "status" "TalentAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacityPercent" INTEGER NOT NULL DEFAULT 100,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCapacitySnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "availableHours" INTEGER NOT NULL,
    "allocatedHours" INTEGER NOT NULL,
    "utilizationPercent" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RESOURCE_PLANNER',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentCapacitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentBenchEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "status" "TalentBenchStatus" NOT NULL DEFAULT 'ON_BENCH',
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "nextAssignmentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentBenchEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentPerformanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rating" "TalentPerformanceRating" NOT NULL,
    "utilizationPercent" INTEGER,
    "deliveryScore" INTEGER,
    "feedback" TEXT,
    "goals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentPerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-AE',
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeApproval" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "KnowledgeApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFaq" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdById" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-AE',
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRetrievalLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "answer" TEXT,
    "sourceArticleIds" TEXT[],
    "confidence" DOUBLE PRECISION,
    "mode" TEXT NOT NULL DEFAULT 'GROUNDED_SEARCH',
    "aiRunId" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRetrievalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "IntegrationConnectorType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "baseUrl" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "path" TEXT NOT NULL DEFAULT '/',
    "authType" "IntegrationAuthType" NOT NULL DEFAULT 'NONE',
    "authConfigEncrypted" TEXT,
    "defaultHeadersEncrypted" TEXT,
    "requestTimeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "mapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "IntegrationApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthIntegration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT,
    "connectedById" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT,
    "authorizationUrl" TEXT,
    "tokenUrl" TEXT,
    "scopes" TEXT[],
    "status" "OAuthIntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "externalAccountReference" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "status" "IntegrationWebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "eventTypes" TEXT[],
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEventSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpointId" TEXT,
    "connectorId" TEXT,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEventSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "status" "IntegrationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "IntegrationAttemptStatus" NOT NULL,
    "responseCode" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationWebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "direction" "IntegrationConnectorType" NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRunAttempt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "IntegrationAttemptStatus" NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "responseCode" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationRunAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmPipeline_organizationId_isActive_idx" ON "CrmPipeline"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipeline_organizationId_name_key" ON "CrmPipeline"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CrmPipelineStage_pipelineId_category_idx" ON "CrmPipelineStage"("pipelineId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipelineStage_pipelineId_position_key" ON "CrmPipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipelineStage_pipelineId_name_key" ON "CrmPipelineStage"("pipelineId", "name");

-- CreateIndex
CREATE INDEX "CrmLead_organizationId_status_createdAt_idx" ON "CrmLead"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmLead_organizationId_email_idx" ON "CrmLead"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CrmLead_assignedToMembershipId_status_idx" ON "CrmLead"("assignedToMembershipId", "status");

-- CreateIndex
CREATE INDEX "CrmAccount_organizationId_status_updatedAt_idx" ON "CrmAccount"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CrmAccount_ownerMembershipId_status_idx" ON "CrmAccount"("ownerMembershipId", "status");

-- CreateIndex
CREATE INDEX "CrmAccount_parentAccountId_idx" ON "CrmAccount"("parentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAccount_organizationId_name_key" ON "CrmAccount"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CrmContact_organizationId_accountId_isPrimary_idx" ON "CrmContact"("organizationId", "accountId", "isPrimary");

-- CreateIndex
CREATE INDEX "CrmContact_organizationId_email_idx" ON "CrmContact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CrmContact_ownerMembershipId_idx" ON "CrmContact"("ownerMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContact_organizationId_accountId_email_key" ON "CrmContact"("organizationId", "accountId", "email");

-- CreateIndex
CREATE INDEX "CrmOpportunity_organizationId_status_expectedCloseAt_idx" ON "CrmOpportunity"("organizationId", "status", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "CrmOpportunity_organizationId_pipelineId_stageId_idx" ON "CrmOpportunity"("organizationId", "pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "CrmOpportunity_accountId_status_idx" ON "CrmOpportunity"("accountId", "status");

-- CreateIndex
CREATE INDEX "CrmOpportunity_ownerMembershipId_status_idx" ON "CrmOpportunity"("ownerMembershipId", "status");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_occurredAt_idx" ON "CrmActivity"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_accountId_occurredAt_idx" ON "CrmActivity"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_contactId_occurredAt_idx" ON "CrmActivity"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_opportunityId_occurredAt_idx" ON "CrmActivity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_leadId_occurredAt_idx" ON "CrmActivity"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_dueAt_completedAt_idx" ON "CrmActivity"("dueAt", "completedAt");

-- CreateIndex
CREATE INDEX "CrmNote_organizationId_createdAt_idx" ON "CrmNote"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmNote_accountId_isPinned_createdAt_idx" ON "CrmNote"("accountId", "isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "CrmNote_contactId_createdAt_idx" ON "CrmNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmNote_opportunityId_createdAt_idx" ON "CrmNote"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmNote_leadId_createdAt_idx" ON "CrmNote"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmQuote_organizationId_status_createdAt_idx" ON "CrmQuote"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmQuote_opportunityId_status_idx" ON "CrmQuote"("opportunityId", "status");

-- CreateIndex
CREATE INDEX "CrmQuote_accountId_createdAt_idx" ON "CrmQuote"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmQuote_organizationId_quoteNumber_key" ON "CrmQuote"("organizationId", "quoteNumber");

-- CreateIndex
CREATE INDEX "CrmQuoteLine_quoteId_idx" ON "CrmQuoteLine"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmQuoteLine_quoteId_position_key" ON "CrmQuoteLine"("quoteId", "position");

-- CreateIndex
CREATE INDEX "CrmCustomerHealthSnapshot_organizationId_band_capturedAt_idx" ON "CrmCustomerHealthSnapshot"("organizationId", "band", "capturedAt");

-- CreateIndex
CREATE INDEX "CrmCustomerHealthSnapshot_accountId_capturedAt_idx" ON "CrmCustomerHealthSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "CrmCustomerMetric_organizationId_key_periodEnd_idx" ON "CrmCustomerMetric"("organizationId", "key", "periodEnd");

-- CreateIndex
CREATE INDEX "CrmCustomerMetric_accountId_periodEnd_idx" ON "CrmCustomerMetric"("accountId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomerMetric_accountId_key_periodStart_periodEnd_key" ON "CrmCustomerMetric"("accountId", "key", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfile_membershipId_key" ON "TalentProfile"("membershipId");

-- CreateIndex
CREATE INDEX "TalentProfile_organizationId_status_updatedAt_idx" ON "TalentProfile"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TalentProfile_organizationId_title_idx" ON "TalentProfile"("organizationId", "title");

-- CreateIndex
CREATE INDEX "TalentProfileSkill_skillId_proficiency_idx" ON "TalentProfileSkill"("skillId", "proficiency");

-- CreateIndex
CREATE INDEX "TalentCertification_talentProfileId_status_expiresAt_idx" ON "TalentCertification"("talentProfileId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TalentCertification_status_expiresAt_idx" ON "TalentCertification"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ResourcePlan_organizationId_status_startsAt_endsAt_idx" ON "ResourcePlan"("organizationId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ResourcePlan_projectId_status_idx" ON "ResourcePlan"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePlan_organizationId_name_key" ON "ResourcePlan"("organizationId", "name");

-- CreateIndex
CREATE INDEX "StaffingRequirement_resourcePlanId_status_idx" ON "StaffingRequirement"("resourcePlanId", "status");

-- CreateIndex
CREATE INDEX "StaffingRequirement_skillId_status_idx" ON "StaffingRequirement"("skillId", "status");

-- CreateIndex
CREATE INDEX "StaffingRequirement_startsAt_endsAt_idx" ON "StaffingRequirement"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "StaffingAssignment_organizationId_status_startsAt_endsAt_idx" ON "StaffingAssignment"("organizationId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "StaffingAssignment_talentProfileId_status_startsAt_endsAt_idx" ON "StaffingAssignment"("talentProfileId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "StaffingAssignment_projectId_status_idx" ON "StaffingAssignment"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffingAssignment_resourcePlanId_talentProfileId_startsAt_key" ON "StaffingAssignment"("resourcePlanId", "talentProfileId", "startsAt");

-- CreateIndex
CREATE INDEX "TalentAvailability_talentProfileId_startsAt_endsAt_idx" ON "TalentAvailability"("talentProfileId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TalentAvailability_status_startsAt_endsAt_idx" ON "TalentAvailability"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TalentCapacitySnapshot_organizationId_periodEnd_utilization_idx" ON "TalentCapacitySnapshot"("organizationId", "periodEnd", "utilizationPercent");

-- CreateIndex
CREATE INDEX "TalentCapacitySnapshot_talentProfileId_periodEnd_idx" ON "TalentCapacitySnapshot"("talentProfileId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCapacitySnapshot_talentProfileId_periodStart_periodEn_key" ON "TalentCapacitySnapshot"("talentProfileId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "TalentBenchEntry_organizationId_status_startedAt_idx" ON "TalentBenchEntry"("organizationId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "TalentBenchEntry_talentProfileId_status_idx" ON "TalentBenchEntry"("talentProfileId", "status");

-- CreateIndex
CREATE INDEX "TalentPerformanceRecord_organizationId_periodEnd_rating_idx" ON "TalentPerformanceRecord"("organizationId", "periodEnd", "rating");

-- CreateIndex
CREATE INDEX "TalentPerformanceRecord_reviewerId_periodEnd_idx" ON "TalentPerformanceRecord"("reviewerId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TalentPerformanceRecord_talentProfileId_periodStart_periodE_key" ON "TalentPerformanceRecord"("talentProfileId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_organizationId_parentId_name_idx" ON "KnowledgeCategory"("organizationId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_organizationId_slug_key" ON "KnowledgeCategory"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_organizationId_status_updatedAt_idx" ON "KnowledgeArticle"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_organizationId_categoryId_status_idx" ON "KnowledgeArticle"("organizationId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_ownerId_status_idx" ON "KnowledgeArticle"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_organizationId_slug_key" ON "KnowledgeArticle"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_articleId_createdAt_idx" ON "KnowledgeArticleVersion"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_createdById_createdAt_idx" ON "KnowledgeArticleVersion"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_version_key" ON "KnowledgeArticleVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeApproval_articleId_decision_createdAt_idx" ON "KnowledgeApproval"("articleId", "decision", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeApproval_reviewerId_decision_idx" ON "KnowledgeApproval"("reviewerId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeApproval_versionId_reviewerId_key" ON "KnowledgeApproval"("versionId", "reviewerId");

-- CreateIndex
CREATE INDEX "KnowledgeFaq_organizationId_status_sortOrder_idx" ON "KnowledgeFaq"("organizationId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "KnowledgeFaq_organizationId_categoryId_status_idx" ON "KnowledgeFaq"("organizationId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalLog_organizationId_createdAt_idx" ON "KnowledgeRetrievalLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalLog_userId_createdAt_idx" ON "KnowledgeRetrievalLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalLog_aiRunId_idx" ON "KnowledgeRetrievalLog"("aiRunId");

-- CreateIndex
CREATE INDEX "IntegrationConnector_organizationId_type_status_idx" ON "IntegrationConnector"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "IntegrationConnector_status_updatedAt_idx" ON "IntegrationConnector"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnector_organizationId_key_key" ON "IntegrationConnector"("organizationId", "key");

-- CreateIndex
CREATE INDEX "IntegrationApiKey_organizationId_status_createdAt_idx" ON "IntegrationApiKey"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationApiKey_status_expiresAt_idx" ON "IntegrationApiKey"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationApiKey_prefix_key" ON "IntegrationApiKey"("prefix");

-- CreateIndex
CREATE INDEX "OAuthIntegration_organizationId_status_updatedAt_idx" ON "OAuthIntegration"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "OAuthIntegration_connectorId_status_idx" ON "OAuthIntegration"("connectorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIntegration_organizationId_provider_name_key" ON "OAuthIntegration"("organizationId", "provider", "name");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEndpoint_organizationId_status_updatedAt_idx" ON "IntegrationWebhookEndpoint"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "IntegrationEventSubscription_organizationId_eventType_enabl_idx" ON "IntegrationEventSubscription"("organizationId", "eventType", "enabled");

-- CreateIndex
CREATE INDEX "IntegrationEventSubscription_endpointId_enabled_idx" ON "IntegrationEventSubscription"("endpointId", "enabled");

-- CreateIndex
CREATE INDEX "IntegrationEventSubscription_connectorId_enabled_idx" ON "IntegrationEventSubscription"("connectorId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEventSubscription_organizationId_endpointId_conn_key" ON "IntegrationEventSubscription"("organizationId", "endpointId", "connectorId", "eventType");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_eventType_occurredAt_idx" ON "IntegrationEvent"("organizationId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_occurredAt_idx" ON "IntegrationEvent"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_correlationId_idx" ON "IntegrationEvent"("correlationId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookDelivery_organizationId_status_nextAttemp_idx" ON "IntegrationWebhookDelivery"("organizationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IntegrationWebhookDelivery_endpointId_status_createdAt_idx" ON "IntegrationWebhookDelivery"("endpointId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookDelivery_eventId_endpointId_key" ON "IntegrationWebhookDelivery"("eventId", "endpointId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookDeliveryAttempt_status_startedAt_idx" ON "IntegrationWebhookDeliveryAttempt"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookDeliveryAttempt_deliveryId_attempt_key" ON "IntegrationWebhookDeliveryAttempt"("deliveryId", "attempt");

-- CreateIndex
CREATE INDEX "IntegrationRun_organizationId_status_createdAt_idx" ON "IntegrationRun"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_status_availableAt_idx" ON "IntegrationRun"("status", "availableAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_connectorId_createdAt_idx" ON "IntegrationRun"("connectorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRun_organizationId_idempotencyKey_key" ON "IntegrationRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationRunAttempt_status_startedAt_idx" ON "IntegrationRunAttempt"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRunAttempt_runId_attempt_key" ON "IntegrationRunAttempt"("runId", "attempt");

-- AddForeignKey
ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_assignedToMembershipId_fkey" FOREIGN KEY ("assignedToMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedAccountId_fkey" FOREIGN KEY ("convertedAccountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedContactId_fkey" FOREIGN KEY ("convertedContactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedOpportunityId_fkey" FOREIGN KEY ("convertedOpportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAccount" ADD CONSTRAINT "CrmAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAccount" ADD CONSTRAINT "CrmAccount_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAccount" ADD CONSTRAINT "CrmAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuote" ADD CONSTRAINT "CrmQuote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuote" ADD CONSTRAINT "CrmQuote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuote" ADD CONSTRAINT "CrmQuote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuote" ADD CONSTRAINT "CrmQuote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuote" ADD CONSTRAINT "CrmQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmQuoteLine" ADD CONSTRAINT "CrmQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerHealthSnapshot" ADD CONSTRAINT "CrmCustomerHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerHealthSnapshot" ADD CONSTRAINT "CrmCustomerHealthSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerMetric" ADD CONSTRAINT "CrmCustomerMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerMetric" ADD CONSTRAINT "CrmCustomerMetric_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfileSkill" ADD CONSTRAINT "TalentProfileSkill_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfileSkill" ADD CONSTRAINT "TalentProfileSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCertification" ADD CONSTRAINT "TalentCertification_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePlan" ADD CONSTRAINT "ResourcePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePlan" ADD CONSTRAINT "ResourcePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePlan" ADD CONSTRAINT "ResourcePlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingRequirement" ADD CONSTRAINT "StaffingRequirement_resourcePlanId_fkey" FOREIGN KEY ("resourcePlanId") REFERENCES "ResourcePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingRequirement" ADD CONSTRAINT "StaffingRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_resourcePlanId_fkey" FOREIGN KEY ("resourcePlanId") REFERENCES "ResourcePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "StaffingRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingAssignment" ADD CONSTRAINT "StaffingAssignment_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentAvailability" ADD CONSTRAINT "TalentAvailability_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCapacitySnapshot" ADD CONSTRAINT "TalentCapacitySnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCapacitySnapshot" ADD CONSTRAINT "TalentCapacitySnapshot_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentBenchEntry" ADD CONSTRAINT "TalentBenchEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentBenchEntry" ADD CONSTRAINT "TalentBenchEntry_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPerformanceRecord" ADD CONSTRAINT "TalentPerformanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPerformanceRecord" ADD CONSTRAINT "TalentPerformanceRecord_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPerformanceRecord" ADD CONSTRAINT "TalentPerformanceRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeApproval" ADD CONSTRAINT "KnowledgeApproval_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeApproval" ADD CONSTRAINT "KnowledgeApproval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeApproval" ADD CONSTRAINT "KnowledgeApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFaq" ADD CONSTRAINT "KnowledgeFaq_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFaq" ADD CONSTRAINT "KnowledgeFaq_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFaq" ADD CONSTRAINT "KnowledgeFaq_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRetrievalLog" ADD CONSTRAINT "KnowledgeRetrievalLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRetrievalLog" ADD CONSTRAINT "KnowledgeRetrievalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnector" ADD CONSTRAINT "IntegrationConnector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnector" ADD CONSTRAINT "IntegrationConnector_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationApiKey" ADD CONSTRAINT "IntegrationApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationApiKey" ADD CONSTRAINT "IntegrationApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthIntegration" ADD CONSTRAINT "OAuthIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthIntegration" ADD CONSTRAINT "OAuthIntegration_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "IntegrationConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthIntegration" ADD CONSTRAINT "OAuthIntegration_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookEndpoint" ADD CONSTRAINT "IntegrationWebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookEndpoint" ADD CONSTRAINT "IntegrationWebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEventSubscription" ADD CONSTRAINT "IntegrationEventSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEventSubscription" ADD CONSTRAINT "IntegrationEventSubscription_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "IntegrationWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEventSubscription" ADD CONSTRAINT "IntegrationEventSubscription_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "IntegrationConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "IntegrationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "IntegrationWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookDeliveryAttempt" ADD CONSTRAINT "IntegrationWebhookDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "IntegrationWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "IntegrationConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRunAttempt" ADD CONSTRAINT "IntegrationRunAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IntegrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
