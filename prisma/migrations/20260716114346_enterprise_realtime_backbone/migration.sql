/*
  Warnings:

  - You are about to drop the column `locale` on the `OrganizationSettings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "RealtimeEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- AlterTable
ALTER TABLE "OrganizationSettings" DROP COLUMN "locale",
ADD COLUMN     "defaultLocale" TEXT NOT NULL DEFAULT 'en-AE',
ADD COLUMN     "supportedLocales" TEXT[] DEFAULT ARRAY['en-AE', 'ar-AE']::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLocale" TEXT NOT NULL DEFAULT 'en-AE';

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "topic" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "actorUserId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "RealtimeEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "RealtimeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "connectionId" TEXT NOT NULL,
    "status" "PresenceStatus" NOT NULL DEFAULT 'ONLINE',
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealtimeEvent_status_availableAt_idx" ON "RealtimeEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_organizationId_createdAt_idx" ON "RealtimeEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_projectId_createdAt_idx" ON "RealtimeEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_topic_createdAt_idx" ON "RealtimeEvent"("topic", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_aggregateType_aggregateId_idx" ON "RealtimeEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "RealtimeConnection_connectionId_key" ON "RealtimeConnection"("connectionId");

-- CreateIndex
CREATE INDEX "RealtimeConnection_userId_disconnectedAt_idx" ON "RealtimeConnection"("userId", "disconnectedAt");

-- CreateIndex
CREATE INDEX "RealtimeConnection_organizationId_disconnectedAt_idx" ON "RealtimeConnection"("organizationId", "disconnectedAt");

-- CreateIndex
CREATE INDEX "PresenceSession_organizationId_status_expiresAt_idx" ON "PresenceSession"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PresenceSession_projectId_status_expiresAt_idx" ON "PresenceSession"("projectId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PresenceSession_resourceType_resourceId_status_idx" ON "PresenceSession"("resourceType", "resourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceSession_userId_connectionId_key" ON "PresenceSession"("userId", "connectionId");

-- AddForeignKey
ALTER TABLE "RealtimeEvent" ADD CONSTRAINT "RealtimeEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealtimeConnection" ADD CONSTRAINT "RealtimeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceSession" ADD CONSTRAINT "PresenceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceSession" ADD CONSTRAINT "PresenceSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
