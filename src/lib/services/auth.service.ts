import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { AUTH_CONFIG } from "@/lib/auth/config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createRefreshToken, hashRefreshToken, signAccessToken } from "@/lib/auth/tokens";
import type {
  AuthenticationMethod,
  IdentityAssuranceLevel,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { DEFAULT_ROLES } from "@/lib/authorization/default-roles";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";
import { AdaptiveAbuseService } from "@/lib/services/adaptive-abuse.service";
import { ensureSeatForMembership } from "@/lib/services/subscription-administration.service";

export class AuthService {
  async register(input: { email:string; displayName:string; password:string }, meta:{ipAddress:string|null;userAgent:string|null}) {
    if (await prisma.user.findUnique({ where:{email:input.email}, select:{id:true} })) {
      throw new AppError("CONFLICT","An account with this email already exists.",409);
    }
    const passwordHash = await hashPassword(input.password);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data:{
          email:input.email,
          displayName:input.displayName,
          passwordHash,
          personalIdentity: {
            create: {
              preferredName: input.displayName,
              countryCode: "AE",
              timezone: "Asia/Dubai",
              locale: "en-AE",
              identityCompletedAt: new Date(),
            },
          },
          onboardingProgress: {
            create: {
              status: "IN_PROGRESS",
              stage: "PERSONAS",
              selectedPersonaTypes: ["CLIENT", "ORGANIZATION"],
            },
          },
        },
        select:{id:true,email:true,displayName:true,isPlatformAdmin:true},
      });
      const baseSlug = input.displayName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
      const organization = await tx.organization.create({ data: {
        name: `${input.displayName}'s Workspace`,
        slug: `${baseSlug}-${randomBytes(4).toString("hex")}`,
        settings: { create: { timezone: "Asia/Dubai", defaultCurrency: "AED", defaultLocale: "en-AE", supportedLocales: ["en-AE", "ar-AE"], dataRegion: "UAE" } },
        companyProfile: { create: { legalName: `${input.displayName}'s Workspace`, countryCode: "AE" } },
      } });
      await tx.organizationIdentityPolicy.create({
        data: { organizationId: organization.id },
      });
      const permissionIds = new Map<string, string>();
      for (const key of PLATFORM_PERMISSIONS) { const permission = await tx.permission.upsert({ where: { key }, create: { key, description: `Dublancer permission: ${key}` }, update: {}, select: { id: true } }); permissionIds.set(key, permission.id); }
      let ownerRoleId = "";
      for (const definition of DEFAULT_ROLES) { const role = await tx.role.create({ data: { organizationId: organization.id, name: definition.name, description: definition.description } }); if (definition.name === "Owner") ownerRoleId = role.id; await tx.rolePermission.createMany({ data: definition.permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key)! })) }); }
      const membership = await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, roleId: ownerRoleId, status: "ACTIVE" } });
      const clientPersona = await tx.accountPersona.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          type: "CLIENT",
          status: "DRAFT",
          label: "Client",
        },
      });
      await tx.clientProfile.create({
        data: {
          userId: user.id,
          personaId: clientPersona.id,
          displayName: input.displayName,
          countryCode: "AE",
          timezone: "Asia/Dubai",
          locale: "en-AE",
        },
      });
      const organizationPersona = await tx.accountPersona.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          type: "ORGANIZATION",
          status: "ACTIVE",
          label: organization.name,
          activatedAt: new Date(),
          lastUsedAt: new Date(),
          events: {
            create: {
              actorUserId: user.id,
              organizationId: organization.id,
              type: "ACTIVATED",
              fromStatus: "DRAFT",
              toStatus: "ACTIVE",
            },
          },
        },
      });
      const starterPlan = await tx.subscriptionPlan.findFirst({ where: { code: "STARTER", isActive: true } });
      if (starterPlan) {
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 14 * 86_400_000);
        const subscription = await tx.organizationSubscription.create({
          data: {
            organizationId: organization.id,
            planId: starterPlan.id,
            status: "TRIALING",
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            trialStartedAt: now,
            trialEndsAt,
            renewAt: trialEndsAt,
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            actorUserId: user.id,
            type: "TRIAL_STARTED",
            reason: "Default organization trial created during registration.",
          },
        });
        await ensureSeatForMembership(tx, organization.id, membership.id, user.id);
      }
      return {
        ...user,
        organizationId: organization.id,
        activePersonaId: organizationPersona.id,
        onboardingRequired: true,
      };
    });
  }

  async login(input:{email:string;password:string;organizationId?:string;deviceLabel?:string},meta:{ipAddress:string|null;userAgent:string|null}) {
    const abuse = new AdaptiveAbuseService();
    await abuse.assertLoginAllowed(input.email, meta, input.deviceLabel, input.organizationId);
    const user = await prisma.user.findUnique({
      where:{email:input.email},
      include:{memberships:{where:{status:"ACTIVE"},select:{organizationId:true}}},
    });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash,input.password))) {
      await prisma.loginEvent.create({data:{email:input.email,outcome:"FAILED",reason:"INVALID_CREDENTIALS",ipAddress:meta.ipAddress,userAgent:meta.userAgent}});
      await abuse.recordFailure(input.email, meta, input.deviceLabel, input.organizationId);
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
    const [policy, activeFactors, activePasskeys] = await Promise.all([
      organizationId
        ? prisma.organizationIdentityPolicy.findUnique({
            where: { organizationId },
          })
        : null,
      prisma.mfaFactor.count({
        where: { userId: user.id, status: "ACTIVE" },
      }),
      prisma.webAuthnCredential.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ]);
    if (policy && !policy.allowPasswordLogin) {
      throw new AppError(
        "FORBIDDEN",
        "Password login is disabled for this organization.",
        403,
      );
    }
    const device = await abuse.recordSuccess(
      user,
      organizationId,
      meta,
      input.deviceLabel,
    );
    if (policy?.requireTrustedDevice && device.status !== "VERIFIED") {
      throw new AppError(
        "FORBIDDEN",
        "This device must be verified before sign-in can continue.",
        403,
        { code: "DEVICE_VERIFICATION_REQUIRED", deviceId: device.id },
      );
    }
    if (activeFactors > 0 || activePasskeys > 0 || policy?.requireMfa) {
      if (activeFactors === 0 && activePasskeys === 0) {
        throw new AppError(
          "FORBIDDEN",
          "MFA enrollment is required before this policy can be satisfied.",
          403,
          { code: "MFA_ENROLLMENT_REQUIRED" },
        );
      }
      const { MfaPasskeyService } = await import(
        "@/lib/services/mfa-passkey.service"
      );
      const challenge = await new MfaPasskeyService().createLoginChallenge({
        userId: user.id,
        organizationId,
        authMethod: "PASSWORD",
        metadata: meta,
        deviceLabel: input.deviceLabel,
        trustedDeviceId: device.status === "VERIFIED" ? device.id : undefined,
      });
      await prisma.loginEvent.create({
        data: {
          userId: user.id,
          email: user.email,
          outcome: "CHALLENGE",
          reason: "MFA_REQUIRED",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
      return {
        mfaRequired: true as const,
        ...challenge,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          isPlatformAdmin: user.isPlatformAdmin,
        },
        organizationId,
      };
    }
    const session = await this.createAuthenticatedSession({
      userId: user.id,
      organizationId,
      authMethod: "PASSWORD",
      assuranceLevel: "AAL1",
      metadata: meta,
      deviceLabel: input.deviceLabel,
      trustedDeviceId: device.status === "VERIFIED" ? device.id : undefined,
    });
    await prisma.loginEvent.create({data:{userId:user.id,email:user.email,outcome:"SUCCESS",ipAddress:meta.ipAddress,userAgent:meta.userAgent}});
    return { mfaRequired: false as const, ...session };
  }

  async createAuthenticatedSession(input: {
    userId: string;
    organizationId: string | null;
    authMethod: AuthenticationMethod;
    assuranceLevel: IdentityAssuranceLevel;
    mfaVerifiedAt?: Date;
    metadata: { ipAddress: string | null; userAgent: string | null };
    deviceLabel?: string;
    trustedDeviceId?: string;
    activePersonaId?: string;
  }) {
    const [user, policy] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          isPlatformAdmin: true,
          onboardingProgress: { select: { status: true, stage: true } },
        },
      }),
      input.organizationId
        ? prisma.organizationIdentityPolicy.findUnique({
            where: { organizationId: input.organizationId },
          })
        : null,
    ]);
    if (input.trustedDeviceId) {
      const device = await prisma.verifiedDevice.findFirst({
        where: {
          id: input.trustedDeviceId,
          userId: input.userId,
          status: "VERIFIED",
        },
      });
      if (!device) {
        throw new AppError("FORBIDDEN", "Trusted device validation failed.", 403);
      }
    }
    const maxAgeMs =
      Math.min(
        policy?.sessionMaxAgeMinutes ??
          Math.floor(AUTH_CONFIG.refreshTokenTtlSeconds / 60),
        Math.floor(AUTH_CONFIG.refreshTokenTtlSeconds / 60),
      ) *
      60_000;
    const idleMs = (policy?.sessionIdleMinutes ?? 720) * 60_000;
    const refreshToken = createRefreshToken();
    const now = new Date();
    let activePersonaId = input.activePersonaId;
    if (input.organizationId && !activePersonaId) {
      const recentPersona = await prisma.accountPersona.findFirst({
        where: {
          userId: input.userId,
          organizationId: input.organizationId,
          status: "ACTIVE",
        },
        orderBy: [{ lastUsedAt: "desc" }, { activatedAt: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      activePersonaId = recentPersona?.id;
    }
    const session = await prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: {
          userId: input.userId,
          organizationId: input.organizationId,
          status: "ACTIVE",
          userAgent: input.metadata.userAgent,
          ipAddress: input.metadata.ipAddress,
          ...(input.trustedDeviceId ? { trustedDeviceId: input.trustedDeviceId } : {}),
        },
        data: { status: "REVOKED", revokedAt: now },
      });
      return tx.authSession.create({ data: {
        userId: input.userId,
        organizationId: input.organizationId,
        activePersonaId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: input.metadata.userAgent,
        ipAddress: input.metadata.ipAddress,
        deviceLabel: input.deviceLabel,
        authMethod: input.authMethod,
        assuranceLevel: input.assuranceLevel,
        mfaVerifiedAt: input.mfaVerifiedAt,
        stepUpExpiresAt: input.mfaVerifiedAt
          ? new Date(
              now.getTime() +
                (policy?.stepUpDurationMinutes ?? 15) * 60_000,
            )
          : null,
        idleExpiresAt: new Date(now.getTime() + idleMs),
        trustedDeviceId: input.trustedDeviceId,
        expiresAt: new Date(now.getTime() + maxAgeMs),
      } });
    });
    const accessToken = await signAccessToken({
      sub: user.id,
      sessionId: session.id,
      organizationId: input.organizationId,
      activePersonaId,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return {
      user,
      sessionId: session.id,
      organizationId: input.organizationId,
      activePersonaId: activePersonaId ?? null,
      accessToken,
      refreshToken,
      onboardingRequired: user.onboardingProgress?.status !== "COMPLETED",
      onboardingStage: user.onboardingProgress?.stage ?? "IDENTITY",
    };
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

    if (
      current.status !== "ACTIVE" ||
      current.expiresAt <= new Date() ||
      (current.idleExpiresAt && current.idleExpiresAt <= new Date())
    ) {
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

    let activePersonaId = current.activePersonaId;
    if (nextOrganizationId !== current.organizationId || !activePersonaId) {
      activePersonaId = nextOrganizationId
        ? (await prisma.accountPersona.findFirst({
            where: {
              userId: current.userId,
              organizationId: nextOrganizationId,
              status: "ACTIVE",
            },
            orderBy: [{ lastUsedAt: "desc" }, { activatedAt: "desc" }, { createdAt: "asc" }],
            select: { id: true },
          }))?.id ?? null
        : null;
    }
    const nextRaw = createRefreshToken();
    const policy = nextOrganizationId
      ? await prisma.organizationIdentityPolicy.findUnique({
          where: { organizationId: nextOrganizationId },
        })
      : null;
    let next: { id: string; organizationId: string | null; activePersonaId: string | null };

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
          activePersonaId,
          refreshTokenHash:hashRefreshToken(nextRaw), userAgent:current.userAgent, ipAddress:current.ipAddress,
          deviceLabel:current.deviceLabel, rotatedFromSessionId:current.id,
          authMethod:current.authMethod, assuranceLevel:current.assuranceLevel,
          mfaVerifiedAt:current.mfaVerifiedAt, stepUpExpiresAt:current.stepUpExpiresAt,
          trustedDeviceId:current.trustedDeviceId,
          idleExpiresAt:new Date(Date.now()+(policy?.sessionIdleMinutes??720)*60_000),
          expiresAt:new Date(Math.min(
            current.expiresAt.getTime(),
            Date.now()+AUTH_CONFIG.refreshTokenTtlSeconds*1000,
          )),
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

    const accessToken = await signAccessToken({sub:current.userId,sessionId:next.id,organizationId:next.organizationId,activePersonaId:next.activePersonaId,isPlatformAdmin:current.user.isPlatformAdmin});
    return {accessToken,refreshToken:nextRaw,sessionId:next.id,organizationId:next.organizationId,activePersonaId:next.activePersonaId};
  }
}
