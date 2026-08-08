-- Dual-Profile Marketplace Phase B is additive. It preserves all Phase A identity,
-- session, membership and authorization records while adding public presentation state.

CREATE TYPE "ProfileVisibility" AS ENUM ('DRAFT', 'HIDDEN', 'PUBLIC', 'VERIFIED', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "ProfileContentType" AS ENUM ('PORTFOLIO', 'CASE_STUDY', 'PUBLICATION', 'RESEARCH');

ALTER TABLE "User" ADD COLUMN "username" TEXT;

WITH candidates AS (
  SELECT
    "id",
    LEFT(COALESCE(NULLIF(LOWER(REGEXP_REPLACE(SPLIT_PART("email", '@', 1), '[^a-zA-Z0-9_-]+', '-', 'g')), ''), 'user'), 48)
      || '-' || LOWER(SUBSTRING("id", 1, 8)) AS "candidate"
  FROM "User"
  WHERE "username" IS NULL
)
UPDATE "User" AS users
SET "username" = candidates."candidate"
FROM candidates
WHERE users."id" = candidates."id";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "ClientProfile"
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "companySize" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "responseTimeMinutes" INTEGER,
  ADD COLUMN "hiringAvailable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showVerifiedSpend" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hiringPreferences" JSONB,
  ADD COLUMN "engagementModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "FreelancerProfile"
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "industries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "fixedPriceAvailable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "resumeUrl" TEXT,
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "githubUrl" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "FreelancerProfile"
SET "visibility" = CASE WHEN "isPublic" THEN 'PUBLIC'::"ProfileVisibility" ELSE 'HIDDEN'::"ProfileVisibility" END;

ALTER TABLE "CompanyProfile"
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "locations" JSONB,
  ADD COLUMN "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "portfolio" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "CompanyProfile"
SET "visibility" = CASE WHEN "verifiedAt" IS NOT NULL THEN 'VERIFIED'::"ProfileVisibility" ELSE 'DRAFT'::"ProfileVisibility" END;

ALTER TABLE "PortfolioItem"
  ADD COLUMN "contentType" "ProfileContentType" NOT NULL DEFAULT 'PORTFOLIO',
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "WorkExperience"
  ADD COLUMN "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "Education" (
  "id" TEXT NOT NULL,
  "freelancerProfileId" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "degree" TEXT NOT NULL,
  "fieldOfStudy" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "description" TEXT,
  "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Education_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Education_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Certification" (
  "id" TEXT NOT NULL,
  "freelancerProfileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "credentialId" TEXT,
  "credentialUrl" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Certification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Certification_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProfileSocialLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "personaType" "AccountPersonaType" NOT NULL,
  "platform" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileSocialLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfileSocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SavedProvider" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "freelancerProfileId" TEXT,
  "providerOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedProvider_exactly_one_target" CHECK (NUM_NONNULLS("freelancerProfileId", "providerOrganizationId") = 1),
  CONSTRAINT "SavedProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedProvider_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedProvider_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DROP INDEX "ClientProfile_countryCode_updatedAt_idx";
DROP INDEX "FreelancerProfile_isPublic_availability_updatedAt_idx";
DROP INDEX "CompanyProfile_countryCode_verifiedAt_idx";
DROP INDEX "PortfolioItem_freelancerProfileId_createdAt_idx";
DROP INDEX "WorkExperience_freelancerProfileId_startedAt_idx";

CREATE INDEX "ClientProfile_visibility_countryCode_updatedAt_idx" ON "ClientProfile"("visibility", "countryCode", "updatedAt");
CREATE INDEX "ClientProfile_deletedAt_visibility_idx" ON "ClientProfile"("deletedAt", "visibility");
CREATE INDEX "FreelancerProfile_visibility_isPublic_availability_updatedAt_idx" ON "FreelancerProfile"("visibility", "isPublic", "availability", "updatedAt");
CREATE INDEX "FreelancerProfile_deletedAt_visibility_idx" ON "FreelancerProfile"("deletedAt", "visibility");
CREATE INDEX "CompanyProfile_visibility_countryCode_verifiedAt_idx" ON "CompanyProfile"("visibility", "countryCode", "verifiedAt");
CREATE INDEX "CompanyProfile_deletedAt_visibility_idx" ON "CompanyProfile"("deletedAt", "visibility");
CREATE INDEX "PortfolioItem_freelancerProfileId_contentType_visibility_sortOrder_idx" ON "PortfolioItem"("freelancerProfileId", "contentType", "visibility", "sortOrder");
CREATE INDEX "PortfolioItem_freelancerProfileId_deletedAt_createdAt_idx" ON "PortfolioItem"("freelancerProfileId", "deletedAt", "createdAt");
CREATE INDEX "WorkExperience_freelancerProfileId_visibility_startedAt_idx" ON "WorkExperience"("freelancerProfileId", "visibility", "startedAt");
CREATE INDEX "WorkExperience_freelancerProfileId_deletedAt_idx" ON "WorkExperience"("freelancerProfileId", "deletedAt");
CREATE INDEX "Education_freelancerProfileId_visibility_endedAt_idx" ON "Education"("freelancerProfileId", "visibility", "endedAt");
CREATE INDEX "Education_freelancerProfileId_deletedAt_idx" ON "Education"("freelancerProfileId", "deletedAt");
CREATE INDEX "Certification_freelancerProfileId_visibility_issuedAt_idx" ON "Certification"("freelancerProfileId", "visibility", "issuedAt");
CREATE INDEX "Certification_freelancerProfileId_deletedAt_idx" ON "Certification"("freelancerProfileId", "deletedAt");
CREATE UNIQUE INDEX "ProfileSocialLink_userId_personaType_platform_key" ON "ProfileSocialLink"("userId", "personaType", "platform");
CREATE INDEX "ProfileSocialLink_userId_personaType_visibility_idx" ON "ProfileSocialLink"("userId", "personaType", "visibility");
CREATE INDEX "ProfileSocialLink_userId_deletedAt_idx" ON "ProfileSocialLink"("userId", "deletedAt");
CREATE UNIQUE INDEX "SavedProvider_user_freelancer_key" ON "SavedProvider"("userId", "organizationId", "freelancerProfileId") WHERE "freelancerProfileId" IS NOT NULL;
CREATE UNIQUE INDEX "SavedProvider_user_organization_key" ON "SavedProvider"("userId", "organizationId", "providerOrganizationId") WHERE "providerOrganizationId" IS NOT NULL;
CREATE UNIQUE INDEX "SavedProvider_userId_organizationId_freelancerProfileId_providerOrganizationId_key" ON "SavedProvider"("userId", "organizationId", "freelancerProfileId", "providerOrganizationId");
CREATE INDEX "SavedProvider_organizationId_freelancerProfileId_createdAt_idx" ON "SavedProvider"("organizationId", "freelancerProfileId", "createdAt");
CREATE INDEX "SavedProvider_organizationId_providerOrganizationId_createdAt_idx" ON "SavedProvider"("organizationId", "providerOrganizationId", "createdAt");
