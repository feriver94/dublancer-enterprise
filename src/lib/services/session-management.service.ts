import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/permission-resolver";

export class SessionManagementService {
  async list(context: TenantContext, scope: "self" | "organization" = "self") {
    if (!context.sessionId) {
      throw new AppError("UNAUTHORIZED", "Authentication session is required.", 401);
    }
    if (scope === "organization") {
      await requirePermission(context, "identity.read");
    }
    const sessions = await prisma.authSession.findMany({
      where: {
        ...(scope === "self"
          ? { userId: context.userId }
          : { organizationId: context.organizationId }),
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        authMethod: true,
        assuranceLevel: true,
        mfaVerifiedAt: true,
        stepUpExpiresAt: true,
        trustedDeviceId: true,
        deviceLabel: true,
        ipAddress: true,
        userAgent: true,
        lastSeenAt: true,
        idleExpiresAt: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: { email: true, displayName: true },
        },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 250,
    });
    const devices = await prisma.verifiedDevice.findMany({
      where:
        scope === "self"
          ? { userId: context.userId }
          : {
              user: {
                memberships: {
                  some: { organizationId: context.organizationId },
                },
              },
            },
      select: {
        id: true,
        userId: true,
        label: true,
        status: true,
        riskScore: true,
        lastIpAddress: true,
        lastSeenAt: true,
        verifiedAt: true,
        revokedAt: true,
        user: { select: { email: true, displayName: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 250,
    });
    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === context.sessionId,
      })),
      devices,
    };
  }

  async revokeSession(context: TenantContext, sessionId: string) {
    if (!context.sessionId) {
      throw new AppError("UNAUTHORIZED", "Authentication session is required.", 401);
    }
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError("NOT_FOUND", "Session not found.", 404);
    const self = session.userId === context.userId;
    if (!self) {
      await requirePermission(context, "identity.manage");
      if (session.organizationId !== context.organizationId) {
        throw new AppError("NOT_FOUND", "Session not found.", 404);
      }
    }
    await prisma.authSession.updateMany({
      where: { id: session.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorUserId: context.userId,
        action: "identity.session.revoked",
        resourceType: "AuthSession",
        resourceId: session.id,
        outcome: "SUCCESS",
        metadata: { self, subjectUserId: session.userId },
      },
    });
    return {
      revoked: true,
      currentSessionRevoked: session.id === context.sessionId,
    };
  }

  async revokeOtherSessions(context: TenantContext) {
    if (!context.sessionId) {
      throw new AppError("UNAUTHORIZED", "Authentication session is required.", 401);
    }
    const result = await prisma.authSession.updateMany({
      where: {
        userId: context.userId,
        id: { not: context.sessionId },
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId || null,
        actorUserId: context.userId,
        action: "identity.sessions.revoked_others",
        resourceType: "AuthSession",
        outcome: "SUCCESS",
        metadata: { count: result.count },
      },
    });
    return { revoked: result.count };
  }

  async revokeDevice(context: TenantContext, deviceId: string) {
    const device = await prisma.verifiedDevice.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new AppError("NOT_FOUND", "Device not found.", 404);
    if (device.userId !== context.userId) {
      await requirePermission(context, "identity.manage");
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: context.organizationId,
          userId: device.userId,
        },
      });
      if (!membership) throw new AppError("NOT_FOUND", "Device not found.", 404);
    }
    const now = new Date();
    const [updated, sessions] = await prisma.$transaction([
      prisma.verifiedDevice.update({
        where: { id: device.id },
        data: { status: "REVOKED", revokedAt: now },
      }),
      prisma.authSession.updateMany({
        where: { trustedDeviceId: device.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      }),
    ]);
    await prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId || null,
        actorUserId: context.userId,
        action: "identity.device.revoked",
        resourceType: "VerifiedDevice",
        resourceId: device.id,
        outcome: "SUCCESS",
        metadata: { revokedSessions: sessions.count },
      },
    });
    return { device: updated, revokedSessions: sessions.count };
  }
}
