import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { fileScanProvider, sha256 } from "@/lib/providers/integrations";

export class FileScanService {
  async accept(providerKey: string, rawBody: string, signature: string) {
    if (providerKey !== fileScanProvider.key || !fileScanProvider.verifyWebhook(rawBody, signature)) throw new AppError("UNAUTHORIZED", "Invalid file scanner signature.", 401);
    let payload: { eventId: string; organizationId: string; fileVersionId: string; status: "CLEAN" | "INFECTED" | "FAILED"; providerReference?: string };
    try { payload = JSON.parse(rawBody) as typeof payload; } catch { throw new AppError("BAD_REQUEST", "Invalid scanner payload.", 400); }
    if (!payload.eventId || !payload.organizationId || !payload.fileVersionId || !["CLEAN", "INFECTED", "FAILED"].includes(payload.status)) throw new AppError("VALIDATION_ERROR", "Invalid scanner result.", 422);
    const existing = await prisma.webhookReceipt.findUnique({ where: { providerKey_eventId: { providerKey, eventId: payload.eventId } } });
    if (existing?.processedAt) return { accepted: true, replay: true };
    const version = await prisma.fileVersion.findFirst({ where: { id: payload.fileVersionId, fileNode: { organizationId: payload.organizationId } }, include: { fileNode: true } });
    if (!version) throw new AppError("NOT_FOUND", "File version not found.", 404);
    return prisma.$transaction(async (tx) => {
      await tx.webhookReceipt.upsert({ where: { providerKey_eventId: { providerKey, eventId: payload.eventId } }, create: { organizationId: payload.organizationId, providerKey, eventId: payload.eventId, payloadHash: sha256(rawBody), signatureVerified: true, processedAt: new Date() }, update: { signatureVerified: true, processedAt: new Date(), failureReason: null } });
      await tx.fileVersion.update({ where: { id: version.id }, data: { scanStatus: payload.status, scanProviderRef: payload.providerReference, scannedAt: new Date() } });
      await tx.fileActivity.create({ data: { fileNodeId: version.fileNodeId, type: payload.status === "INFECTED" ? "QUARANTINED" : "SCANNED", metadata: { fileVersionId: version.id, status: payload.status, providerKey } as Prisma.InputJsonValue } });
      if (payload.status === "INFECTED") await tx.securityEvent.create({ data: { organizationId: payload.organizationId, type: "FILE_MALWARE_DETECTED", severity: "CRITICAL", metadata: { fileNodeId: version.fileNodeId, fileVersionId: version.id } } });
      return { accepted: true, replay: false, status: payload.status };
    });
  }
}
