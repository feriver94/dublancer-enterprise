-- Dual-Profile Marketplace Architecture Phase C
-- Additive persona evidence, governed invitations/follows, and reputation dimensions.

CREATE TYPE "MarketplaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

ALTER TABLE "MarketplaceListing"
  ADD COLUMN "actingPersonaId" TEXT;

ALTER TABLE "Proposal"
  ADD COLUMN "providerPersonaId" TEXT;

ALTER TABLE "Contract"
  ADD COLUMN "clientAccountId" TEXT,
  ADD COLUMN "clientProfileId" TEXT,
  ADD COLUMN "providerProfileId" TEXT,
  ADD COLUMN "clientPersonaId" TEXT,
  ADD COLUMN "providerPersonaId" TEXT,
  ADD COLUMN "clientPersonaType" "AccountPersonaType",
  ADD COLUMN "providerPersonaType" "AccountPersonaType";

ALTER TABLE "ContractAcceptance"
  ADD COLUMN "personaId" TEXT,
  ADD COLUMN "personaType" "AccountPersonaType",
  ADD COLUMN "membershipId" TEXT;

ALTER TABLE "Review"
  ADD COLUMN "reviewerPersonaId" TEXT,
  ADD COLUMN "subjectPersonaId" TEXT,
  ADD COLUMN "subjectClientProfileId" TEXT,
  ADD COLUMN "subjectFreelancerProfileId" TEXT,
  ADD COLUMN "contextOrganizationId" TEXT,
  ADD COLUMN "directionKey" TEXT,
  ADD COLUMN "quality" INTEGER,
  ADD COLUMN "communication" INTEGER,
  ADD COLUMN "delivery" INTEGER,
  ADD COLUMN "expertise" INTEGER,
  ADD COLUMN "professionalism" INTEGER,
  ADD COLUMN "hiringClarity" INTEGER,
  ADD COLUMN "paymentReliability" INTEGER,
  ADD COLUMN "professionalConduct" INTEGER;

CREATE TABLE "ProfileFollow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "clientProfileId" TEXT,
  "freelancerProfileId" TEXT,
  "targetOrganizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileFollow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfileFollow_exactly_one_target" CHECK (num_nonnulls("clientProfileId", "freelancerProfileId", "targetOrganizationId") = 1)
);

CREATE TABLE "MarketplaceInvitation" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "clientOrganizationId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "freelancerProfileId" TEXT,
  "providerOrganizationId" TEXT,
  "status" "MarketplaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceInvitation_exactly_one_target" CHECK (num_nonnulls("freelancerProfileId", "providerOrganizationId") = 1)
);

CREATE UNIQUE INDEX "ProfileFollow_userId_organizationId_targetKey_key" ON "ProfileFollow"("userId", "organizationId", "targetKey");
CREATE INDEX "ProfileFollow_clientProfileId_createdAt_idx" ON "ProfileFollow"("clientProfileId", "createdAt");
CREATE INDEX "ProfileFollow_freelancerProfileId_createdAt_idx" ON "ProfileFollow"("freelancerProfileId", "createdAt");
CREATE INDEX "ProfileFollow_targetOrganizationId_createdAt_idx" ON "ProfileFollow"("targetOrganizationId", "createdAt");

CREATE UNIQUE INDEX "MarketplaceInvitation_listingId_targetKey_key" ON "MarketplaceInvitation"("listingId", "targetKey");
CREATE INDEX "MarketplaceInvitation_clientOrganizationId_status_createdAt_idx" ON "MarketplaceInvitation"("clientOrganizationId", "status", "createdAt");
CREATE INDEX "MarketplaceInvitation_freelancerProfileId_status_createdAt_idx" ON "MarketplaceInvitation"("freelancerProfileId", "status", "createdAt");
CREATE INDEX "MarketplaceInvitation_providerOrganizationId_status_createdAt_idx" ON "MarketplaceInvitation"("providerOrganizationId", "status", "createdAt");

CREATE INDEX "MarketplaceListing_actingPersonaId_status_updatedAt_idx" ON "MarketplaceListing"("actingPersonaId", "status", "updatedAt");
CREATE INDEX "Proposal_providerPersonaId_status_updatedAt_idx" ON "Proposal"("providerPersonaId", "status", "updatedAt");
CREATE INDEX "Contract_clientPersonaId_status_idx" ON "Contract"("clientPersonaId", "status");
CREATE INDEX "Contract_providerPersonaId_status_idx" ON "Contract"("providerPersonaId", "status");
CREATE INDEX "Contract_clientProfileId_status_idx" ON "Contract"("clientProfileId", "status");
CREATE INDEX "Contract_providerProfileId_status_idx" ON "Contract"("providerProfileId", "status");
CREATE INDEX "ContractAcceptance_personaId_acceptedAt_idx" ON "ContractAcceptance"("personaId", "acceptedAt");
CREATE UNIQUE INDEX "Review_directionKey_key" ON "Review"("directionKey");
CREATE INDEX "Review_subjectClientProfileId_status_publishedAt_idx" ON "Review"("subjectClientProfileId", "status", "publishedAt");
CREATE INDEX "Review_subjectFreelancerProfileId_status_publishedAt_idx" ON "Review"("subjectFreelancerProfileId", "status", "publishedAt");
CREATE INDEX "Review_contextOrganizationId_reviewerParty_status_idx" ON "Review"("contextOrganizationId", "reviewerParty", "status");

ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_actingPersonaId_fkey" FOREIGN KEY ("actingPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_providerPersonaId_fkey" FOREIGN KEY ("providerPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientPersonaId_fkey" FOREIGN KEY ("clientPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_providerPersonaId_fkey" FOREIGN KEY ("providerPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerPersonaId_fkey" FOREIGN KEY ("reviewerPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectPersonaId_fkey" FOREIGN KEY ("subjectPersonaId") REFERENCES "AccountPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectClientProfileId_fkey" FOREIGN KEY ("subjectClientProfileId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectFreelancerProfileId_fkey" FOREIGN KEY ("subjectFreelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_contextOrganizationId_fkey" FOREIGN KEY ("contextOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProfileFollow" ADD CONSTRAINT "ProfileFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileFollow" ADD CONSTRAINT "ProfileFollow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileFollow" ADD CONSTRAINT "ProfileFollow_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileFollow" ADD CONSTRAINT "ProfileFollow_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileFollow" ADD CONSTRAINT "ProfileFollow_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_freelancerProfileId_fkey" FOREIGN KEY ("freelancerProfileId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceInvitation" ADD CONSTRAINT "MarketplaceInvitation_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_dimension_ranges" CHECK (
  ("rating" BETWEEN 1 AND 5) AND
  ("quality" IS NULL OR "quality" BETWEEN 1 AND 5) AND
  ("communication" IS NULL OR "communication" BETWEEN 1 AND 5) AND
  ("delivery" IS NULL OR "delivery" BETWEEN 1 AND 5) AND
  ("expertise" IS NULL OR "expertise" BETWEEN 1 AND 5) AND
  ("professionalism" IS NULL OR "professionalism" BETWEEN 1 AND 5) AND
  ("hiringClarity" IS NULL OR "hiringClarity" BETWEEN 1 AND 5) AND
  ("paymentReliability" IS NULL OR "paymentReliability" BETWEEN 1 AND 5) AND
  ("professionalConduct" IS NULL OR "professionalConduct" BETWEEN 1 AND 5)
);
