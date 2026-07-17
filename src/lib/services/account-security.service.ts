import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { hashPassword } from "@/lib/auth/password";
import { createSecurityToken, hashSecurityToken } from "@/lib/auth/security-tokens";

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
    await prisma.userNotification.create({ data: { userId: user.id, organizationId, type: "EMAIL_VERIFICATION", category: "SECURITY", priority: "HIGH", title: "Verify your Dublancer email", body: "Complete email verification to secure your account.", actionUrl, dedupeKey: `email-verification:${user.id}:${hashSecurityToken(raw).slice(0, 16)}`, deliveries: { create: { userId: user.id, channel: "EMAIL" } } } });
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
    await prisma.userNotification.create({ data: { userId: user.id, organizationId, type: "PASSWORD_RESET", category: "SECURITY", priority: "HIGH", title: "Reset your Dublancer password", body: "Use this secure link to reset your password.", actionUrl, dedupeKey: `password-reset:${user.id}:${hashSecurityToken(raw).slice(0, 16)}`, deliveries: { create: { userId: user.id, channel: "EMAIL" } } } });
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
    ]);

    return { passwordReset: true };
  }
}
