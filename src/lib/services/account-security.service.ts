import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { hashPassword } from "@/lib/auth/password";
import { createSecurityToken, hashSecurityToken } from "@/lib/auth/security-tokens";
import { EmailOperationsService } from "@/lib/services/email-operations.service";

const emailOperations = new EmailOperationsService();

export class AccountSecurityService {
  async requestEmailVerification(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return { accepted: true };

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const raw = createSecurityToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashSecurityToken(raw),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const organizationId = (await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { organizationId: true } }))?.organizationId;
    const actionUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verify-email?token=${encodeURIComponent(raw)}`;
    await emailOperations.queue({
      organizationId,
      userId: user.id,
      recipient: user.email,
      templateKey: "account-verification",
      locale: user.preferredLocale,
      variables: { actionUrl, primaryColor: "#009A44" },
      metadata: { actionUrl, tokenId: hashSecurityToken(raw).slice(0, 16) },
    });
    return { accepted: true, ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEVELOPMENT_TOKENS === "true" ? { developmentToken: raw } : {}) };
  }

  async verifyEmail(raw: string) {
    const token = await prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash: hashSecurityToken(raw),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) throw new AppError("NOT_FOUND", "Verification token is invalid or expired.", 404);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { emailVerified: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorUserId: token.userId,
          action: "account.email.verified",
          resourceType: "User",
          resourceId: token.userId,
          outcome: "SUCCESS",
        },
      }),
    ]);

    return { verified: true };
  }

  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { accepted: true };

    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const raw = createSecurityToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashSecurityToken(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const organizationId = (await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { organizationId: true } }))?.organizationId;
    const actionUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/reset-password?token=${encodeURIComponent(raw)}`;
    await emailOperations.queue({
      organizationId,
      userId: user.id,
      recipient: user.email,
      templateKey: "password-reset",
      locale: user.preferredLocale,
      variables: { actionUrl, primaryColor: "#009A44" },
      metadata: { actionUrl, tokenId: hashSecurityToken(raw).slice(0, 16) },
    });
    return { accepted: true, ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEVELOPMENT_TOKENS === "true" ? { developmentToken: raw } : {}) };
  }

  async resetPassword(raw: string, password: string) {
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashSecurityToken(raw),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!token) throw new AppError("NOT_FOUND", "Password reset token is invalid or expired.", 404);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      prisma.authSession.updateMany({
        where: { userId: token.userId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorUserId: token.userId,
          action: "account.password.reset",
          resourceType: "User",
          resourceId: token.userId,
          outcome: "SUCCESS",
        },
      }),
    ]);

    return { passwordReset: true };
  }

  async requestEmailChange(userId: string, newEmail: string) {
    const normalized = newEmail.toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("NOT_FOUND", "User not found.", 404);
    if (user.email === normalized) return { accepted: true };
    if (await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } })) {
      throw new AppError("CONFLICT", "An account with this email already exists.", 409);
    }
    await prisma.emailChangeToken.deleteMany({ where: { userId, usedAt: null } });
    const raw = createSecurityToken();
    const token = await prisma.emailChangeToken.create({
      data: {
        userId,
        newEmail: normalized,
        tokenHash: hashSecurityToken(raw),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const organizationId = (await prisma.membership.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { organizationId: true },
    }))?.organizationId;
    const actionUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/verify-email-change?token=${encodeURIComponent(raw)}`;
    await emailOperations.queue({
      organizationId,
      userId,
      recipient: normalized,
      templateKey: "email-change-verification",
      locale: user.preferredLocale,
      variables: { actionUrl, primaryColor: "#009A44" },
      metadata: { actionUrl, tokenId: token.id },
    });
    return {
      accepted: true,
      ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEVELOPMENT_TOKENS === "true"
        ? { developmentToken: raw }
        : {}),
    };
  }

  async verifyEmailChange(raw: string) {
    const token = await prisma.emailChangeToken.findFirst({
      where: {
        tokenHash: hashSecurityToken(raw),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!token) throw new AppError("NOT_FOUND", "Email change token is invalid or expired.", 404);
    if (await prisma.user.findUnique({ where: { email: token.newEmail }, select: { id: true } })) {
      throw new AppError("CONFLICT", "An account with this email already exists.", 409);
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { email: token.newEmail, emailVerified: new Date() },
      }),
      prisma.emailChangeToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      prisma.authSession.updateMany({
        where: { userId: token.userId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorUserId: token.userId,
          action: "account.email.changed",
          resourceType: "User",
          resourceId: token.userId,
          outcome: "SUCCESS",
          metadata: { newEmailFingerprint: hashSecurityToken(token.newEmail) },
        },
      }),
    ]);
    return { emailChanged: true };
  }
}
