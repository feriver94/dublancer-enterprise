import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { fileScanProvider, sha256 } from "@/lib/providers/integrations";
import { PHASE4_JOB_TYPES } from "@/lib/jobs/phase4-job.service";

export class FileScanService {
  async accept(providerKey: string, rawBody: string, signature: string) {
    if (providerKey !== fileScanProvider.key || !fileScanProvider.verifyWebhook(rawBody, signature)) throw new AppError("UNAUTHORIZED", "Invalid file scanner signature.", 401);
    let payload: { eventId: string; organizationId: string; fileVersionId: string; status: "CLEAN" | "INFECTED" | "FAILED"; providerReference?: string };
    try { payload = JSON.parse(rawBody) as typeof payload; } catch { throw new AppError("BAD_REQUEST", "Invalid scanner payload.", 400); }
    if (!payload.eventId || !payload.organizationId || !payload.fileVersionId || !["CLEAN", "INFECTED", "FAILED"].includes(payload.status)) throw new AppError("VALIDATION_ERROR", "Invalid scanner result.", 422);
    const existing = await prisma.webhookReceipt.findUnique({ where: { providerKey_eventId: { providerKey, eventId: payload.eventId } } });
    if (existing?.processedAt) {
      if (existing.payloadHash !== sha256(rawBody)) throw new AppError("CONFLICT", "Scanner event identifier was replayed with different content.", 409);
      return { accepted: true, replay: true };
    }
    const version = await prisma.fileVersion.findFirst({ where: { id: payload.fileVersionId, fileNode: { organizationId: payload.organizationId } }, include: { fileNode: true } });
    if (!version) throw new AppError("NOT_FOUND", "File version not found.", 404);
    return prisma.$transaction(async (tx) => {
      await tx.webhookReceipt.upsert({ where: { providerKey_eventId: { providerKey, eventId: payload.eventId } }, create: { organizationId: payload.organizationId, providerKey, eventId: payload.eventId, payloadHash: sha256(rawBody), signatureVerified: true, processedAt: new Date() }, update: { signatureVerified: true, processedAt: new Date(), failureReason: null } });
      await tx.fileVersion.update({ where: { id: version.id }, data: { scanStatus: payload.status, scanProviderRef: payload.providerReference, scannedAt: new Date() } });
      await tx.fileActivity.create({ data: { fileNodeId: version.fileNodeId, type: payload.status === "INFECTED" ? "QUARANTINED" : "SCANNED", metadata: { fileVersionId: version.id, status: payload.status, providerKey } as Prisma.InputJsonValue } });
      if (payload.status === "INFECTED") await tx.securityEvent.create({ data: { organizationId: payload.organizationId, type: "FILE_MALWARE_DETECTED", severity: "CRITICAL", metadata: { fileNodeId: version.fileNodeId, fileVersionId: version.id } } });
      await tx.analyticsEvent.create({ data: { organizationId: payload.organizationId, projectId: version.fileNode.projectId, eventType: `file.scan.${payload.status.toLowerCase()}`, properties: { fileNodeId: version.fileNodeId, fileVersionId: version.id, providerKey } as Prisma.InputJsonValue } });
      await tx.realtimeEvent.create({ data: { organizationId: payload.organizationId, projectId: version.fileNode.projectId, topic: version.fileNode.projectId ? `project:${version.fileNode.projectId}` : `organization:${payload.organizationId}`, eventType: "file.scan.updated", aggregateType: "FileNode", aggregateId: version.fileNodeId, payload: { fileVersionId: version.id, status: payload.status } as Prisma.InputJsonValue } });
      const action = payload.status === "CLEAN" ? "UPSERT" : "DELETE";
      await tx.backgroundJob.upsert({
        where: { deduplicationKey: `search:file:${version.fileNodeId}:${action}:scan:${payload.eventId}` },
        create: { organizationId: payload.organizationId, type: PHASE4_JOB_TYPES.SEARCH_ENTITY, deduplicationKey: `search:file:${version.fileNodeId}:${action}:scan:${payload.eventId}`, payload: { entityType: "FILE", entityId: version.fileNodeId, action } as Prisma.InputJsonValue },
        update: {},
      });
      if (payload.status === "FAILED") {
        await tx.backgroundJob.upsert({
          where: { deduplicationKey: `file-scan:${version.id}:retry:${payload.eventId}` },
          create: { organizationId: payload.organizationId, type: PHASE4_JOB_TYPES.FILE_SCAN, deduplicationKey: `file-scan:${version.id}:retry:${payload.eventId}`, payload: { fileVersionId: version.id } as Prisma.InputJsonValue, availableAt: new Date(Date.now() + 30_000) },
          update: {},
        });
      }
      return { accepted: true, replay: false, status: payload.status };
    });
  }
}
