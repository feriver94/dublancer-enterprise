import { createHash } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { createSecurityToken, hashSecurityToken } from "@/lib/auth/security-tokens";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { EmailOperationsService } from "@/lib/services/email-operations.service";

const emailOperations = new EmailOperationsService();
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

function fingerprint(value: string) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

function normalizeIp(value: string | null) {
  return value?.trim().toLowerCase().replace(/^::ffff:/, "") || null;
}

function deviceFingerprint(userAgent: string | null, deviceLabel?: string) {
  return fingerprint(`${userAgent ?? "unknown"}:${deviceLabel ?? "unlabelled"}`);
}

async function subject(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      preferredLocale: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { organizationId: true },
      },
    },
  });
}

export class AdaptiveAbuseService {
  async assertLoginAllowed(
    email: string,
    meta: { ipAddress: string | null; userAgent: string | null },
    deviceLabel?: string,
    requestedOrganizationId?: string,
  ) {
    const user = await subject(email);
    if (!user) return;
    const organizationId =
      user.memberships.find(
        (item) => item.organizationId === requestedOrganizationId,
      )?.organizationId ?? user.memberships[0]?.organizationId;
    const now = new Date();
    await prisma.accountLock.updateMany({
      where: { userId: user.id, status: "ACTIVE", lockedUntil: { lte: now } },
      data: { status: "EXPIRED" },
    });
    const lock = await prisma.accountLock.findFirst({
      where: { userId: user.id, status: "ACTIVE", lockedUntil: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!lock) return;
    await prisma.securityEvent.create({
      data: {
        organizationId,
        userId: user.id,
        type: "AUTH_LOCK_ENFORCED",
        severity: "HIGH",
        ipAddress: normalizeIp(meta.ipAddress),
        userAgent: meta.userAgent,
        metadata: {
          lockId: lock.id,
          deviceFingerprint: deviceFingerprint(meta.userAgent, deviceLabel),
          lockedUntil: lock.lockedUntil,
        },
      },
    });
    throw new AppError(
      "RATE_LIMITED",
      "Account sign-in is temporarily locked. Try again later.",
      429,
      { retryAfterSeconds: Math.max(1, Math.ceil((lock.lockedUntil.getTime() - now.getTime()) / 1000)) },
    );
  }

  async recordFailure(
    email: string,
    meta: { ipAddress: string | null; userAgent: string | null },
    deviceLabel?: string,
    requestedOrganizationId?: string,
  ) {
    const user = await subject(email);
    const since = new Date(Date.now() - WINDOW_MS);
    const ipAddress = normalizeIp(meta.ipAddress);
    const emailFingerprint = fingerprint(email);
    const device = deviceFingerprint(meta.userAgent, deviceLabel);
    const [emailFailures, ipFailures, knownDevice] = await Promise.all([
      prisma.loginEvent.count({ where: { email, outcome: "FAILED", occurredAt: { gte: since } } }),
      ipAddress
        ? prisma.loginEvent.count({ where: { ipAddress, outcome: "FAILED", occurredAt: { gte: since } } })
        : Promise.resolve(0),
      user
        ? prisma.verifiedDevice.findUnique({
            where: { userId_fingerprintHash: { userId: user.id, fingerprintHash: device } },
          })
        : Promise.resolve(null),
    ]);
    const reasons: string[] = [];
    let score = 0;
    if (emailFailures >= 3) {
      score += Math.min(emailFailures * 12, 60);
      reasons.push("REPEATED_ACCOUNT_FAILURES");
    }
    if (ipFailures >= 3) {
      score += Math.min(ipFailures * 7, 35);
      reasons.push("REPEATED_SOURCE_FAILURES");
    }
    if (!knownDevice || knownDevice.status !== "VERIFIED") {
      score += 10;
      reasons.push("UNVERIFIED_DEVICE");
    }
    score = Math.min(score, 100);
    const action =
      user && score >= 70 && emailFailures >= 5 && ipFailures >= 3
        ? "LOCK"
        : score >= 45
          ? "THROTTLE"
          : score >= 20
            ? "CHALLENGE"
            : "ALLOW";
    const organizationId =
      user?.memberships.find((item) => item.organizationId === requestedOrganizationId)
        ?.organizationId ?? user?.memberships[0]?.organizationId;
    const decision = await prisma.adaptiveRiskDecision.create({
      data: {
        organizationId,
        userId: user?.id,
        emailFingerprint,
        ipAddress,
        deviceFingerprint: device,
        score,
        action,
        reasons,
        metadata: { emailFailures, ipFailures },
      },
    });

    if (action !== "LOCK" || !user) return decision;
    const existing = await prisma.accountLock.findFirst({
      where: { userId: user.id, status: "ACTIVE", lockedUntil: { gt: new Date() } },
    });
    if (existing) return decision;
    const lock = await prisma.accountLock.create({
      data: {
        organizationId,
        userId: user.id,
        riskDecisionId: decision.id,
        reason: reasons.join(","),
        lockedUntil: new Date(Date.now() + LOCK_MS),
      },
    });
    await prisma.$transaction([
      prisma.securityEvent.create({
        data: {
          organizationId,
          userId: user.id,
          type: "AUTH_ADAPTIVE_ACCOUNT_LOCK",
          severity: "HIGH",
          ipAddress,
          userAgent: meta.userAgent,
          metadata: { riskDecisionId: decision.id, lockId: lock.id, score, reasons },
        },
      }),
      prisma.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: "security.account_lock.created",
          resourceType: "AccountLock",
          resourceId: lock.id,
          outcome: "SUCCESS",
          metadata: { riskDecisionId: decision.id, score },
        },
      }),
    ]);
    try {
      await emailOperations.queue({
        organizationId,
        userId: user.id,
        recipient: user.email,
        templateKey: "security-account-lock",
        locale: user.preferredLocale,
        variables: {
          lockedUntil: lock.lockedUntil.toISOString(),
          actionUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/security-center`,
          primaryColor: "#009A44",
        },
        metadata: { lockId: lock.id, riskDecisionId: decision.id },
      });
    } catch {
      await prisma.emailAuditEvent.create({
        data: {
          organizationId,
          type: "email.security_notification_queue_failed",
          metadata: { userId: user.id, lockId: lock.id },
        },
      });
    }
    return decision;
  }

  async recordSuccess(
    user: { id: string; email: string; preferredLocale?: string },
    organizationId: string | null,
    meta: { ipAddress: string | null; userAgent: string | null },
    deviceLabel?: string,
  ) {
    const rawToken = createSecurityToken();
    const fingerprintHash = deviceFingerprint(meta.userAgent, deviceLabel);
    const existing = await prisma.verifiedDevice.findUnique({
      where: { userId_fingerprintHash: { userId: user.id, fingerprintHash } },
    });
    const device = await prisma.verifiedDevice.upsert({
      where: { userId_fingerprintHash: { userId: user.id, fingerprintHash } },
      create: {
        userId: user.id,
        fingerprintHash,
        verificationTokenHash: hashSecurityToken(rawToken),
        verificationExpiresAt: new Date(Date.now() + 86_400_000),
        label: deviceLabel,
        lastIpAddress: normalizeIp(meta.ipAddress),
      },
      update: {
        label: deviceLabel ?? existing?.label,
        lastIpAddress: normalizeIp(meta.ipAddress),
        lastSeenAt: new Date(),
        ...(existing?.status === "VERIFIED"
          ? {}
          : {
              verificationTokenHash: hashSecurityToken(rawToken),
              verificationExpiresAt: new Date(Date.now() + 86_400_000),
            }),
      },
    });
    await prisma.adaptiveRiskDecision.create({
      data: {
        organizationId,
        userId: user.id,
        emailFingerprint: fingerprint(user.email),
        ipAddress: normalizeIp(meta.ipAddress),
        deviceFingerprint: fingerprintHash,
        score: device.status === "VERIFIED" ? 0 : 10,
        action: device.status === "VERIFIED" ? "ALLOW" : "CHALLENGE",
        reasons: device.status === "VERIFIED" ? [] : ["UNVERIFIED_DEVICE"],
      },
    });
    if (device.status !== "VERIFIED") {
      const actionUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verify-device?token=${encodeURIComponent(rawToken)}`;
      try {
        await emailOperations.queue({
          organizationId,
          userId: user.id,
          recipient: user.email,
          templateKey: "device-verification",
          locale: user.preferredLocale,
          variables: { actionUrl, primaryColor: "#009A44" },
          metadata: { deviceId: device.id, actionUrl },
        });
      } catch {
        await prisma.emailAuditEvent.create({
          data: {
            organizationId,
            type: "email.device_verification_queue_failed",
            metadata: { userId: user.id, deviceId: device.id },
          },
        });
      }
    }
    return device;
  }

  async verifyDevice(rawToken: string) {
    const tokenHash = hashSecurityToken(rawToken);
    const device = await prisma.verifiedDevice.findFirst({
      where: {
        verificationTokenHash: tokenHash,
        verificationExpiresAt: { gt: new Date() },
        status: "PENDING",
      },
    });
    if (!device) throw new AppError("NOT_FOUND", "Device verification token is invalid or expired.", 404);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.verifiedDevice.update({
        where: { id: device.id },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          verificationTokenHash: null,
          verificationExpiresAt: null,
          riskScore: 0,
        },
      });
      await tx.auditEvent.create({
        data: {
          userId: device.userId,
          action: "security.device.verified",
          resourceType: "VerifiedDevice",
          resourceId: device.id,
          outcome: "SUCCESS",
        },
      });
      return updated;
    });
  }

  async dashboard(context: TenantContext) {
    await requirePermission(context, "security.events.read");
    const userIds = (
      await prisma.membership.findMany({
        where: { organizationId: context.organizationId },
        select: { userId: true },
      })
    ).map((item) => item.userId);
    const [decisions, locks, devices] = await Promise.all([
      prisma.adaptiveRiskDecision.findMany({
        where: { organizationId: context.organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.accountLock.findMany({
        where: { organizationId: context.organizationId },
        include: { user: { select: { email: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.verifiedDevice.findMany({
        where: { userId: { in: userIds } },
        include: { user: { select: { email: true, displayName: true } } },
        orderBy: { lastSeenAt: "desc" },
        take: 100,
      }),
    ]);
    return { decisions, locks, devices };
  }

  async review(
    context: TenantContext,
    input:
      | { action: "RELEASE_LOCK"; id: string; note: string }
      | { action: "VERIFY_DEVICE" | "REVOKE_DEVICE"; id: string; note: string }
      | { action: "REVIEW_DECISION"; id: string; note: string },
  ) {
    await requirePermission(context, "security.events.manage");
    if (input.action === "RELEASE_LOCK") {
      const lock = await prisma.accountLock.findFirst({
        where: { id: input.id, organizationId: context.organizationId, status: "ACTIVE" },
      });
      if (!lock) throw new AppError("NOT_FOUND", "Active account lock not found.", 404);
      return prisma.accountLock.update({
        where: { id: lock.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          releasedById: context.userId,
          releaseNote: input.note,
        },
      });
    }
    if (input.action === "REVIEW_DECISION") {
      const decision = await prisma.adaptiveRiskDecision.findFirst({
        where: { id: input.id, organizationId: context.organizationId },
      });
      if (!decision) throw new AppError("NOT_FOUND", "Risk decision not found.", 404);
      return prisma.adaptiveRiskDecision.update({
        where: { id: decision.id },
        data: { reviewedAt: new Date(), reviewedById: context.userId, reviewNote: input.note },
      });
    }
    const userIds = (
      await prisma.membership.findMany({
        where: { organizationId: context.organizationId },
        select: { userId: true },
      })
    ).map((item) => item.userId);
    const device = await prisma.verifiedDevice.findFirst({
      where: { id: input.id, userId: { in: userIds } },
    });
    if (!device) throw new AppError("NOT_FOUND", "Verified device not found.", 404);
    return prisma.verifiedDevice.update({
      where: { id: device.id },
      data:
        input.action === "VERIFY_DEVICE"
          ? { status: "VERIFIED", verifiedAt: new Date(), revokedAt: null, riskScore: 0 }
          : { status: "REVOKED", revokedAt: new Date() },
    });
  }
}
