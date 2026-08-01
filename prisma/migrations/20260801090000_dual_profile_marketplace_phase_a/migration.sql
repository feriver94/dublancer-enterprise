-- Phase A establishes one-account/multi-persona identity without changing existing marketplace records.
CREATE TYPE "AccountPersonaType" AS ENUM ('CLIENT', 'FREELANCER', 'ORGANIZATION');
CREATE TYPE "AccountPersonaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "OnboardingStage" AS ENUM ('IDENTITY', 'PERSONAS', 'PROFILES', 'REVIEW', 'COMPLETE');
CREATE TYPE "PersonaEventType" AS ENUM ('CREATED', 'ACTIVATED', 'SUSPENDED', 'REACTIVATED', 'SWITCHED', 'ONBOARDING_COMPLETED');

ALTER TABLE "AuthSession" ADD COLUMN "activePersonaId" TEXT;
ALTER TABLE "FreelancerProfile" ADD COLUMN "personaId" TEXT;

CREATE TABLE "PersonalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "preferredName" TEXT NOT NULL,
  "legalFirstName" TEXT,
  "legalLastName" TEXT,
  "phoneCountryCode" TEXT,
  "phoneNumber" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'AE',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "locale" TEXT NOT NULL DEFAULT 'en-AE',
  "identityCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "stage" "OnboardingStage" NOT NULL DEFAULT 'IDENTITY',
  "selectedPersonaTypes" "AccountPersonaType"[] NOT NULL DEFAULT ARRAY[]::"AccountPersonaType"[],
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountPersona" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "AccountPersonaType" NOT NULL,
  "status" "AccountPersonaStatus" NOT NULL DEFAULT 'DRAFT',
  "label" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountPersona_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "headline" TEXT,
  "about" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'AE',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "locale" TEXT NOT NULL DEFAULT 'en-AE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonaEvent" (
  "id" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "PersonaEventType" NOT NULL,
  "fromStatus" "AccountPersonaStatus",
  "toStatus" "AccountPersonaStatus",
  "sessionId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalIdentity_userId_key" ON "PersonalIdentity"("userId");
CREATE INDEX "PersonalIdentity_countryCode_locale_idx" ON "PersonalIdentity"("countryCode", "locale");
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");
CREATE INDEX "OnboardingProgress_status_updatedAt_idx" ON "OnboardingProgress"("status", "updatedAt");
CREATE UNIQUE INDEX "AccountPersona_userId_type_organizationId_key" ON "AccountPersona"("userId", "type", "organizationId");
CREATE UNIQUE INDEX "AccountPersona_one_client_per_account_key" ON "AccountPersona"("userId") WHERE "type" = 'CLIENT';
CREATE UNIQUE INDEX "AccountPersona_one_freelancer_per_account_key" ON "AccountPersona"("userId") WHERE "type" = 'FREELANCER';
CREATE INDEX "AccountPersona_userId_status_lastUsedAt_idx" ON "AccountPersona"("userId", "status", "lastUsedAt");
CREATE INDEX "AccountPersona_organizationId_type_status_idx" ON "AccountPersona"("organizationId", "type", "status");
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");
CREATE UNIQUE INDEX "ClientProfile_personaId_key" ON "ClientProfile"("personaId");
CREATE INDEX "ClientProfile_countryCode_updatedAt_idx" ON "ClientProfile"("countryCode", "updatedAt");
CREATE UNIQUE INDEX "FreelancerProfile_personaId_key" ON "FreelancerProfile"("personaId");
CREATE INDEX "PersonaEvent_personaId_createdAt_idx" ON "PersonaEvent"("personaId", "createdAt");
CREATE INDEX "PersonaEvent_actorUserId_createdAt_idx" ON "PersonaEvent"("actorUserId", "createdAt");
CREATE INDEX "PersonaEvent_organizationId_type_createdAt_idx" ON "PersonaEvent"("organizationId", "type", "createdAt");
CREATE INDEX "AuthSession_activePersonaId_status_idx" ON "AuthSession"("activePersonaId", "status");

ALTER TABLE "PersonalIdentity" ADD CONSTRAINT "PersonalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPersona" ADD CONSTRAINT "AccountPersona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPersona" ADD CONSTRAINT "AccountPersona_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "AccountPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FreelancerProfile" ADD CONSTRAINT "FreelancerProfile_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonaEvent" ADD CONSTRAINT "PersonaEvent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "AccountPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaEvent" ADD CONSTRAINT "PersonaEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaEvent" ADD CONSTRAINT "PersonaEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_activePersonaId_fkey" FOREIGN KEY ("activePersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing accounts are marked complete so Phase A does not interrupt released Phase 0-10 workflows.
INSERT INTO "PersonalIdentity" ("id", "userId", "preferredName", "countryCode", "timezone", "locale", "identityCompletedAt", "createdAt", "updatedAt")
SELECT 'identity-' || md5(u."id"), u."id", COALESCE(NULLIF(u."displayName", ''), split_part(u."email", '@', 1)), 'AE', 'Asia/Dubai', u."preferredLocale", CURRENT_TIMESTAMP, u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "OnboardingProgress" ("id", "userId", "status", "stage", "selectedPersonaTypes", "completedAt", "createdAt", "updatedAt")
SELECT 'onboarding-' || md5(u."id"), u."id", 'COMPLETED', 'COMPLETE', ARRAY['CLIENT', 'ORGANIZATION']::"AccountPersonaType"[], CURRENT_TIMESTAMP, u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("userId") DO NOTHING;

WITH primary_membership AS (
  SELECT DISTINCT ON (m."userId") m."userId", m."organizationId", o."name"
  FROM "Membership" m
  JOIN "Organization" o ON o."id" = m."organizationId"
  WHERE m."status" = 'ACTIVE' AND o."status" = 'ACTIVE'
  ORDER BY m."userId", m."createdAt", m."id"
)
INSERT INTO "AccountPersona" ("id", "userId", "organizationId", "type", "status", "label", "activatedAt", "lastUsedAt", "createdAt", "updatedAt")
SELECT 'persona-client-' || md5(pm."userId"), pm."userId", pm."organizationId", 'CLIENT', 'ACTIVE', 'Client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM primary_membership pm
ON CONFLICT ("userId", "type", "organizationId") DO NOTHING;

INSERT INTO "AccountPersona" ("id", "userId", "organizationId", "type", "status", "label", "activatedAt", "createdAt", "updatedAt")
SELECT 'persona-org-' || md5(m."userId" || ':' || m."organizationId"), m."userId", m."organizationId", 'ORGANIZATION', 'ACTIVE', o."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Membership" m
JOIN "Organization" o ON o."id" = m."organizationId"
WHERE m."status" = 'ACTIVE' AND o."status" = 'ACTIVE'
ON CONFLICT ("userId", "type", "organizationId") DO NOTHING;

WITH primary_membership AS (
  SELECT DISTINCT ON (m."userId") m."userId", m."organizationId"
  FROM "Membership" m
  JOIN "Organization" o ON o."id" = m."organizationId"
  WHERE m."status" = 'ACTIVE' AND o."status" = 'ACTIVE'
  ORDER BY m."userId", m."createdAt", m."id"
)
INSERT INTO "AccountPersona" ("id", "userId", "organizationId", "type", "status", "label", "activatedAt", "createdAt", "updatedAt")
SELECT 'persona-freelancer-' || md5(fp."userId"), fp."userId", pm."organizationId", 'FREELANCER', 'ACTIVE', fp."headline", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FreelancerProfile" fp
JOIN primary_membership pm ON pm."userId" = fp."userId"
ON CONFLICT ("userId", "type", "organizationId") DO NOTHING;

INSERT INTO "ClientProfile" ("id", "userId", "personaId", "displayName", "countryCode", "timezone", "locale", "createdAt", "updatedAt")
SELECT 'client-profile-' || md5(ap."userId"), ap."userId", ap."id", pi."preferredName", pi."countryCode", pi."timezone", pi."locale", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AccountPersona" ap
JOIN "PersonalIdentity" pi ON pi."userId" = ap."userId"
WHERE ap."type" = 'CLIENT'
ON CONFLICT ("userId") DO NOTHING;

UPDATE "FreelancerProfile" fp
SET "personaId" = ap."id"
FROM "AccountPersona" ap
WHERE ap."userId" = fp."userId" AND ap."type" = 'FREELANCER' AND fp."personaId" IS NULL;

UPDATE "OnboardingProgress" op
SET "selectedPersonaTypes" = ARRAY(
  SELECT DISTINCT ap."type" FROM "AccountPersona" ap WHERE ap."userId" = op."userId" ORDER BY ap."type"
);
