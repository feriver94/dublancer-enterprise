import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { AUTH_CONFIG } from "@/lib/auth/config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createRefreshToken, hashRefreshToken, signAccessToken } from "@/lib/auth/tokens";
import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_ROLES } from "@/lib/authorization/default-roles";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";

export class AuthService {
  async register(input: { email:string; displayName:string; password:string }, meta:{ipAddress:string|null;userAgent:string|null}) {
    if (await prisma.user.findUnique({ where:{email:input.email}, select:{id:true} })) {
      throw new AppError("CONFLICT","An account with this email already exists.",409);
    }
    const passwordHash = await hashPassword(input.password);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data:{ email:input.email, displayName:input.displayName, passwordHash }, select:{id:true,email:true,displayName:true,isPlatformAdmin:true} });
      const baseSlug = input.displayName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
      const organization = await tx.organization.create({ data: { name: `${input.displayName}'s Workspace`, slug: `${baseSlug}-${randomBytes(4).toString("hex")}`, settings: { create: { timezone: "Asia/Dubai", defaultCurrency: "AED", defaultLocale: "en-AE", supportedLocales: ["en-AE", "ar-AE"], dataRegion: "UAE" } } } });
      const permissionIds = new Map<string, string>();
      for (const key of PLATFORM_PERMISSIONS) { const permission = await tx.permission.upsert({ where: { key }, create: { key, description: `Dublancer permission: ${key}` }, update: {}, select: { id: true } }); permissionIds.set(key, permission.id); }
      let ownerRoleId = "";
      for (const definition of DEFAULT_ROLES) { const role = await tx.role.create({ data: { organizationId: organization.id, name: definition.name, description: definition.description } }); if (definition.name === "Owner") ownerRoleId = role.id; await tx.rolePermission.createMany({ data: definition.permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key)! })) }); }
      await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, roleId: ownerRoleId, status: "ACTIVE" } });
      return { ...user, organizationId: organization.id };
    });
  }

  async login(input:{email:string;password:string;organizationId?:string;deviceLabel?:string},meta:{ipAddress:string|null;userAgent:string|null}) {
    const recentFailures = await prisma.loginEvent.count({
  where: {
    email: input.email,
    outcome: "FAILED",
    occurredAt: {
      gte: new Date(Date.now() - 15 * 60_000)
    }
  }
});
    if (recentFailures >= 5) {
      const lockedUser = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, memberships: { where: { status: "ACTIVE" }, take: 1, select: { organizationId: true } } } });
      await prisma.securityEvent.create({ data: { organizationId: lockedUser?.memberships[0]?.organizationId, userId: lockedUser?.id, type: "AUTH_LOGIN_LOCKOUT", severity: "HIGH", ipAddress: meta.ipAddress, userAgent: meta.userAgent, metadata: { emailFingerprint: createHash("sha256").update(input.email).digest("hex") } } });
      throw new AppError("RATE_LIMITED", "Account sign-in is temporarily locked. Try again later.", 429);
    }
    const user = await prisma.user.findUnique({
      where:{email:input.email},
      include:{memberships:{where:{status:"ACTIVE"},select:{organizationId:true}}},
    });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash,input.password))) {
      await prisma.loginEvent.create({data:{email:input.email,outcome:"FAILED",reason:"INVALID_CREDENTIALS",ipAddress:meta.ipAddress,userAgent:meta.userAgent}});
      throw new AppError("UNAUTHORIZED","Invalid email or password.",401);
    }
    if (
      input.organizationId &&
      !user.isPlatformAdmin &&
      !user.memberships.some(
        (membership) => membership.organizationId === input.organizationId,
      )
    ) {
      throw new AppError(
        "FORBIDDEN",
        "An active membership is required for the selected organization.",
        403,
      );
    }
    const organizationId = input.organizationId ?? user.memberships[0]?.organizationId ?? null;
    const refreshToken = createRefreshToken();
    const session = await prisma.authSession.create({
      data:{
        userId:user.id, organizationId, refreshTokenHash:hashRefreshToken(refreshToken),
        userAgent:meta.userAgent, ipAddress:meta.ipAddress, deviceLabel:input.deviceLabel,
        expiresAt:new Date(Date.now()+AUTH_CONFIG.refreshTokenTtlSeconds*1000),
      },
    });
    const accessToken = await signAccessToken({
      sub:user.id, sessionId:session.id, organizationId, isPlatformAdmin:user.isPlatformAdmin,
    });
    await prisma.loginEvent.create({data:{userId:user.id,email:user.email,outcome:"SUCCESS",ipAddress:meta.ipAddress,userAgent:meta.userAgent}});
    return { user:{id:user.id,email:user.email,displayName:user.displayName,isPlatformAdmin:user.isPlatformAdmin}, sessionId:session.id, organizationId, accessToken, refreshToken };
  }

  async refresh(raw:string, organizationId?:string) {
    const refreshTokenHash = hashRefreshToken(raw);
    const current = await prisma.authSession.findUnique({
      where:{refreshTokenHash},
      include:{user:{select:{isPlatformAdmin:true}}},
    });

    if (!current) {
      throw new AppError("UNAUTHORIZED","Refresh token is invalid or expired.",401);
    }

    const revokeActiveSessions = async () => {
      await prisma.authSession.updateMany({
        where: { userId: current.userId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    };

    if (current.status !== "ACTIVE" || current.expiresAt <= new Date()) {
      await revokeActiveSessions();
      throw new AppError(
        "UNAUTHORIZED",
        "Refresh token replay was detected. Active sessions were revoked.",
        401,
      );
    }

    const nextOrganizationId = organizationId ?? current.organizationId;

    if (!current.user.isPlatformAdmin) {
      if (!nextOrganizationId) {
        throw new AppError(
          "FORBIDDEN",
          "An active organization membership is required.",
          403,
        );
      }

      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: nextOrganizationId,
          userId: current.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      if (!membership) {
        throw new AppError(
          "FORBIDDEN",
          "An active membership is required for the selected organization.",
          403,
        );
      }
    }

    const nextRaw = createRefreshToken();
    let next: { id: string; organizationId: string | null };

    try {
      next = await prisma.$transaction(async tx => {
        const rotated = await tx.authSession.updateMany({
          where: {
            id: current.id,
            refreshTokenHash,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          data: { status: "REVOKED", revokedAt: new Date() },
        });

        if (rotated.count !== 1) {
          throw new AppError(
            "UNAUTHORIZED",
            "Refresh token replay was detected.",
            401,
          );
        }

        return tx.authSession.create({data:{
          userId:current.userId, organizationId:nextOrganizationId,
          refreshTokenHash:hashRefreshToken(nextRaw), userAgent:current.userAgent, ipAddress:current.ipAddress,
          deviceLabel:current.deviceLabel, rotatedFromSessionId:current.id,
          expiresAt:new Date(Date.now()+AUTH_CONFIG.refreshTokenTtlSeconds*1000),
        }});
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        error.message.includes("replay")
      ) {
        await revokeActiveSessions();
      }
      throw error;
    }

    const accessToken = await signAccessToken({sub:current.userId,sessionId:next.id,organizationId:next.organizationId,isPlatformAdmin:current.user.isPlatformAdmin});
    return {accessToken,refreshToken:nextRaw,sessionId:next.id,organizationId:next.organizationId};
  }
}
