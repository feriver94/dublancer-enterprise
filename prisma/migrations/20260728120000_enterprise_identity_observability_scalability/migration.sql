-- CreateEnum
CREATE TYPE "IdentityProviderType" AS ENUM ('SAML', 'OIDC');

-- CreateEnum
CREATE TYPE "IdentityProviderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthenticationMethod" AS ENUM ('PASSWORD', 'SAML', 'OIDC', 'PASSKEY', 'BACKUP_CODE');

-- CreateEnum
CREATE TYPE "IdentityAssuranceLevel" AS ENUM ('AAL1', 'AAL2', 'AAL3');

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP', 'PASSKEY');

-- CreateEnum
CREATE TYPE "MfaFactorStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuthenticationChallengeType" AS ENUM ('LOGIN_MFA', 'TOTP_ENROLLMENT', 'WEBAUTHN_REGISTRATION', 'WEBAUTHN_AUTHENTICATION', 'STEP_UP');

-- CreateEnum
CREATE TYPE "AuthenticationChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "IdentityLoginAttemptStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScimProvisioningAction" AS ENUM ('CREATE', 'UPDATE', 'DEACTIVATE', 'REACTIVATE', 'DELETE');

-- CreateEnum
CREATE TYPE "ScimProvisioningStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrivilegedAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SloIndicatorType" AS ENUM ('AVAILABILITY', 'LATENCY', 'ERROR_RATE', 'QUEUE_AGE');

-- CreateEnum
CREATE TYPE "SloWindow" AS ENUM ('ROLLING_1H', 'ROLLING_24H', 'ROLLING_7D', 'ROLLING_30D');

-- CreateEnum
CREATE TYPE "SloMeasurementStatus" AS ENUM ('HEALTHY', 'AT_RISK', 'BREACHED', 'NO_DATA');

-- CreateEnum
CREATE TYPE "AlertHookType" AS ENUM ('WEBHOOK', 'EMAIL');

-- CreateEnum
CREATE TYPE "AlertDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "AuditExportDestinationType" AS ENUM ('WEBHOOK', 'OBJECT_STORAGE');

-- CreateEnum
CREATE TYPE "AuditExportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScalingRecommendationStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PerformanceProfileStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LoadTestRunStatus" AS ENUM ('PLANNED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "assuranceLevel" "IdentityAssuranceLevel" NOT NULL DEFAULT 'AAL1',
ADD COLUMN     "authMethod" "AuthenticationMethod" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "idleExpiresAt" TIMESTAMP(3),
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "stepUpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "trustedDeviceId" TEXT;

-- CreateTable
CREATE TABLE "OrganizationIdentityPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requireMfa" BOOLEAN NOT NULL DEFAULT false,
    "requireMfaForPrivileged" BOOLEAN NOT NULL DEFAULT true,
    "allowPasswordLogin" BOOLEAN NOT NULL DEFAULT true,
    "allowPasskeyLogin" BOOLEAN NOT NULL DEFAULT true,
    "requireTrustedDevice" BOOLEAN NOT NULL DEFAULT false,
    "jitProvisioningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultRoleId" TEXT,
    "sessionMaxAgeMinutes" INTEGER NOT NULL DEFAULT 43200,
    "sessionIdleMinutes" INTEGER NOT NULL DEFAULT 720,
    "stepUpDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "minimumAssuranceLevel" "IdentityAssuranceLevel" NOT NULL DEFAULT 'AAL1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationIdentityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "IdentityProviderType" NOT NULL,
    "status" "IdentityProviderStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "entryPoint" TEXT,
    "callbackUrl" TEXT NOT NULL,
    "idpCertificate" TEXT,
    "oidcDiscoveryUrl" TEXT,
    "oidcClientId" TEXT,
    "oidcClientSecretCipher" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY['openid', 'email', 'profile']::TEXT[],
    "requiredAcr" TEXT,
    "assuranceLevel" "IdentityAssuranceLevel" NOT NULL DEFAULT 'AAL1',
    "attributeMapping" JSONB,
    "allowedEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jitProvisioningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultRoleId" TEXT,
    "wantAssertionsSigned" BOOLEAN NOT NULL DEFAULT true,
    "wantAuthnResponseSigned" BOOLEAN NOT NULL DEFAULT true,
    "validateInResponseTo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "claims" JSONB,
    "sessionIndex" TEXT,
    "lastAuthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityLoginAttempt" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "nonceHash" TEXT,
    "codeVerifierCipher" TEXT,
    "samlRequestId" TEXT,
    "returnTo" TEXT,
    "status" "IdentityLoginAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MfaFactorType" NOT NULL,
    "status" "MfaFactorStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "secretCipher" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfaFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "aaguid" TEXT,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" "AuthenticationChallengeType" NOT NULL,
    "status" "AuthenticationChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "challengeHash" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimAccessToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['Users.read', 'Users.write']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScimAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenId" TEXT,
    "providerId" TEXT,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScimResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimProvisioningEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "resourceId" TEXT,
    "externalId" TEXT,
    "action" "ScimProvisioningAction" NOT NULL,
    "status" "ScimProvisioningStatus" NOT NULL DEFAULT 'PROCESSING',
    "requestId" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScimProvisioningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivilegedAccessRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "permissions" TEXT[],
    "reason" TEXT NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "status" "PrivilegedAccessStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivilegedAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivilegedAccessGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "revokedById" TEXT,
    "permissions" TEXT[],
    "status" "PrivilegedAccessStatus" NOT NULL DEFAULT 'APPROVED',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivilegedAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLevelObjective" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "indicatorType" "SloIndicatorType" NOT NULL,
    "service" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "latencyThresholdMs" INTEGER,
    "window" "SloWindow" NOT NULL DEFAULT 'ROLLING_30D',
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceLevelObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SloMeasurement" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndedAt" TIMESTAMP(3) NOT NULL,
    "goodEvents" BIGINT NOT NULL DEFAULT 0,
    "totalEvents" BIGINT NOT NULL DEFAULT 0,
    "observedValue" DOUBLE PRECISION,
    "errorBudgetUsed" DOUBLE PRECISION,
    "status" "SloMeasurementStatus" NOT NULL DEFAULT 'NO_DATA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SloMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertHook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "type" "AlertHookType" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "secretCipher" TEXT,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertHook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "hookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AlertDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExportDestination" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AuditExportDestinationType" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "secretCipher" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cursorCreatedAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditExportDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExportRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "AuditExportRunStatus" NOT NULL DEFAULT 'PENDING',
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "firstEventAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "checksumSha256" TEXT,
    "responseCode" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditExportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerScalingPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "queue" TEXT NOT NULL,
    "minWorkers" INTEGER NOT NULL DEFAULT 1,
    "maxWorkers" INTEGER NOT NULL DEFAULT 20,
    "targetJobsPerWorker" INTEGER NOT NULL DEFAULT 10,
    "targetOldestJobAgeMs" INTEGER NOT NULL DEFAULT 30000,
    "scaleDownCooldownMs" INTEGER NOT NULL DEFAULT 300000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerScalingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerScalingRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "policyId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "currentWorkers" INTEGER NOT NULL,
    "desiredWorkers" INTEGER NOT NULL,
    "pendingJobs" INTEGER NOT NULL,
    "oldestJobAgeMs" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ScalingRecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerScalingRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "operation" TEXT NOT NULL,
    "correlationId" TEXT,
    "status" "PerformanceProfileStatus" NOT NULL DEFAULT 'RUNNING',
    "durationMs" INTEGER,
    "cpuUserMicros" BIGINT,
    "cpuSystemMicros" BIGINT,
    "heapDeltaBytes" BIGINT,
    "metadata" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PerformanceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadTestRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "requestedById" TEXT,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "status" "LoadTestRunStatus" NOT NULL DEFAULT 'PLANNED',
    "concurrency" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "p50LatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "p99LatencyMs" INTEGER,
    "maxLatencyMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationIdentityPolicy_organizationId_key" ON "OrganizationIdentityPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationIdentityPolicy_requireMfa_requireTrustedDevice_idx" ON "OrganizationIdentityPolicy"("requireMfa", "requireTrustedDevice");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_organizationId_slug_key" ON "IdentityProvider"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "IdentityProvider_organizationId_status_type_idx" ON "IdentityProvider"("organizationId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_organizationId_name_key" ON "IdentityProvider"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_lastAuthenticatedAt_idx" ON "ExternalIdentity"("userId", "lastAuthenticatedAt");

-- CreateIndex
CREATE INDEX "ExternalIdentity_email_idx" ON "ExternalIdentity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_providerId_subject_key" ON "ExternalIdentity"("providerId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_providerId_userId_key" ON "ExternalIdentity"("providerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityLoginAttempt_stateHash_key" ON "IdentityLoginAttempt"("stateHash");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityLoginAttempt_samlRequestId_key" ON "IdentityLoginAttempt"("samlRequestId");

-- CreateIndex
CREATE INDEX "IdentityLoginAttempt_providerId_status_expiresAt_idx" ON "IdentityLoginAttempt"("providerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "IdentityLoginAttempt_organizationId_createdAt_idx" ON "IdentityLoginAttempt"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MfaFactor_userId_status_type_idx" ON "MfaFactor"("userId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MfaBackupCode_codeHash_key" ON "MfaBackupCode"("codeHash");

-- CreateIndex
CREATE INDEX "MfaBackupCode_userId_usedAt_idx" ON "MfaBackupCode"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "MfaBackupCode_factorId_usedAt_idx" ON "MfaBackupCode"("factorId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_revokedAt_idx" ON "WebAuthnCredential"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationChallenge_challengeHash_key" ON "AuthenticationChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "AuthenticationChallenge_userId_status_expiresAt_idx" ON "AuthenticationChallenge"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthenticationChallenge_organizationId_status_expiresAt_idx" ON "AuthenticationChallenge"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScimAccessToken_tokenHash_key" ON "ScimAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ScimAccessToken_organizationId_revokedAt_expiresAt_idx" ON "ScimAccessToken"("organizationId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScimAccessToken_organizationId_name_key" ON "ScimAccessToken"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ScimResource_membershipId_idx" ON "ScimResource"("membershipId");

-- CreateIndex
CREATE INDEX "ScimResource_tokenId_updatedAt_idx" ON "ScimResource"("tokenId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScimResource_organizationId_externalId_key" ON "ScimResource"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimResource_organizationId_userId_key" ON "ScimResource"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimProvisioningEvent_requestId_key" ON "ScimProvisioningEvent"("requestId");

-- CreateIndex
CREATE INDEX "ScimProvisioningEvent_organizationId_createdAt_idx" ON "ScimProvisioningEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ScimProvisioningEvent_tokenId_status_createdAt_idx" ON "ScimProvisioningEvent"("tokenId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ScimProvisioningEvent_resourceId_idx" ON "ScimProvisioningEvent"("resourceId");

-- CreateIndex
CREATE INDEX "PrivilegedAccessRequest_organizationId_status_createdAt_idx" ON "PrivilegedAccessRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrivilegedAccessRequest_requestedById_status_expiresAt_idx" ON "PrivilegedAccessRequest"("requestedById", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivilegedAccessGrant_requestId_key" ON "PrivilegedAccessGrant"("requestId");

-- CreateIndex
CREATE INDEX "PrivilegedAccessGrant_organizationId_status_expiresAt_idx" ON "PrivilegedAccessGrant"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PrivilegedAccessGrant_userId_status_expiresAt_idx" ON "PrivilegedAccessGrant"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceLevelObjective_organizationId_enabled_idx" ON "ServiceLevelObjective"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "ServiceLevelObjective_service_indicatorType_idx" ON "ServiceLevelObjective"("service", "indicatorType");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLevelObjective_organizationId_key_key" ON "ServiceLevelObjective"("organizationId", "key");

-- CreateIndex
CREATE INDEX "SloMeasurement_objectiveId_createdAt_idx" ON "SloMeasurement"("objectiveId", "createdAt");

-- CreateIndex
CREATE INDEX "SloMeasurement_status_createdAt_idx" ON "SloMeasurement"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SloMeasurement_objectiveId_windowStartedAt_windowEndedAt_key" ON "SloMeasurement"("objectiveId", "windowStartedAt", "windowEndedAt");

-- CreateIndex
CREATE INDEX "AlertHook_organizationId_enabled_idx" ON "AlertHook"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AlertHook_organizationId_name_key" ON "AlertHook"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AlertDelivery_status_availableAt_idx" ON "AlertDelivery"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AlertDelivery_hookId_createdAt_idx" ON "AlertDelivery"("hookId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditExportDestination_organizationId_enabled_idx" ON "AuditExportDestination"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AuditExportDestination_organizationId_name_key" ON "AuditExportDestination"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AuditExportRun_organizationId_status_createdAt_idx" ON "AuditExportRun"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditExportRun_destinationId_createdAt_idx" ON "AuditExportRun"("destinationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerScalingPolicy_enabled_queue_idx" ON "WorkerScalingPolicy"("enabled", "queue");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerScalingPolicy_organizationId_queue_key" ON "WorkerScalingPolicy"("organizationId", "queue");

-- CreateIndex
CREATE INDEX "WorkerScalingRecommendation_organizationId_status_createdAt_idx" ON "WorkerScalingRecommendation"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerScalingRecommendation_queue_status_expiresAt_idx" ON "WorkerScalingRecommendation"("queue", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PerformanceProfile_organizationId_operation_startedAt_idx" ON "PerformanceProfile"("organizationId", "operation", "startedAt");

-- CreateIndex
CREATE INDEX "PerformanceProfile_status_startedAt_idx" ON "PerformanceProfile"("status", "startedAt");

-- CreateIndex
CREATE INDEX "PerformanceProfile_durationMs_idx" ON "PerformanceProfile"("durationMs");

-- CreateIndex
CREATE INDEX "LoadTestRun_organizationId_status_createdAt_idx" ON "LoadTestRun"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LoadTestRun_requestedById_createdAt_idx" ON "LoadTestRun"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_trustedDeviceId_status_idx" ON "AuthSession"("trustedDeviceId", "status");

-- CreateIndex
CREATE INDEX "AuthSession_userId_assuranceLevel_status_idx" ON "AuthSession"("userId", "assuranceLevel", "status");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_trustedDeviceId_fkey" FOREIGN KEY ("trustedDeviceId") REFERENCES "VerifiedDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationIdentityPolicy" ADD CONSTRAINT "OrganizationIdentityPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProvider" ADD CONSTRAINT "IdentityProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLoginAttempt" ADD CONSTRAINT "IdentityLoginAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLoginAttempt" ADD CONSTRAINT "IdentityLoginAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaFactor" ADD CONSTRAINT "MfaFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaBackupCode" ADD CONSTRAINT "MfaBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaBackupCode" ADD CONSTRAINT "MfaBackupCode_factorId_fkey" FOREIGN KEY ("factorId") REFERENCES "MfaFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticationChallenge" ADD CONSTRAINT "AuthenticationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimAccessToken" ADD CONSTRAINT "ScimAccessToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimAccessToken" ADD CONSTRAINT "ScimAccessToken_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimResource" ADD CONSTRAINT "ScimResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimResource" ADD CONSTRAINT "ScimResource_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ScimAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimResource" ADD CONSTRAINT "ScimResource_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimResource" ADD CONSTRAINT "ScimResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimResource" ADD CONSTRAINT "ScimResource_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimProvisioningEvent" ADD CONSTRAINT "ScimProvisioningEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimProvisioningEvent" ADD CONSTRAINT "ScimProvisioningEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ScimAccessToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessRequest" ADD CONSTRAINT "PrivilegedAccessRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessRequest" ADD CONSTRAINT "PrivilegedAccessRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessRequest" ADD CONSTRAINT "PrivilegedAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessGrant" ADD CONSTRAINT "PrivilegedAccessGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessGrant" ADD CONSTRAINT "PrivilegedAccessGrant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivilegedAccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessGrant" ADD CONSTRAINT "PrivilegedAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessGrant" ADD CONSTRAINT "PrivilegedAccessGrant_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivilegedAccessGrant" ADD CONSTRAINT "PrivilegedAccessGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelObjective" ADD CONSTRAINT "ServiceLevelObjective_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SloMeasurement" ADD CONSTRAINT "SloMeasurement_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "ServiceLevelObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertHook" ADD CONSTRAINT "AlertHook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_hookId_fkey" FOREIGN KEY ("hookId") REFERENCES "AlertHook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExportDestination" ADD CONSTRAINT "AuditExportDestination_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExportRun" ADD CONSTRAINT "AuditExportRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExportRun" ADD CONSTRAINT "AuditExportRun_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "AuditExportDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExportRun" ADD CONSTRAINT "AuditExportRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerScalingPolicy" ADD CONSTRAINT "WorkerScalingPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerScalingRecommendation" ADD CONSTRAINT "WorkerScalingRecommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerScalingRecommendation" ADD CONSTRAINT "WorkerScalingRecommendation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "WorkerScalingPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceProfile" ADD CONSTRAINT "PerformanceProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTestRun" ADD CONSTRAINT "LoadTestRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadTestRun" ADD CONSTRAINT "LoadTestRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 8 hot-path indexes for tenant search, fair queue claiming, and active sessions.
CREATE INDEX "SearchDocument_active_tenant_rank_idx"
ON "SearchDocument"("organizationId", "entityType", "indexedAt" DESC, "id")
WHERE "deletedAt" IS NULL;

CREATE INDEX "BackgroundJob_claimable_queue_idx"
ON "BackgroundJob"("queue", "priority", "availableAt", "createdAt", "id")
WHERE "status" = 'PENDING';

CREATE INDEX "AuthSession_active_idle_idx"
ON "AuthSession"("userId", "lastSeenAt", "expiresAt")
WHERE "status" = 'ACTIVE';
