import { Prisma, type AccountPersonaType } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { signAccessToken } from "@/lib/auth/tokens";
import type { TenantContext } from "@/lib/tenancy/context";
import type { z } from "zod";
import type { updateOnboardingSchema } from "@/lib/validation/persona";

type OnboardingInput = z.infer<typeof updateOnboardingSchema>;

const personaInclude = {
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      companyProfile: {
        select: {
          legalName: true,
          tradingName: true,
          description: true,
          website: true,
        },
      },
    },
  },
  clientProfile: true,
  freelancerProfile: {
    select: {
      id: true,
      headline: true,
      bio: true,
      availability: true,
      hourlyRateMinor: true,
      currency: true,
      yearsExperience: true,
    },
  },
} satisfies Prisma.AccountPersonaInclude;

function metadata(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function assertMembership(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  organizationId: string,
) {
  const membership = await client.membership.findFirst({
    where: {
      userId,
      organizationId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!membership) throw new AppError("FORBIDDEN", "Active organization membership required.", 403);
}

async function assertReady(
  tx: Prisma.TransactionClient,
  persona: { id: string; userId: string; organizationId: string; type: AccountPersonaType },
) {
  const identity = await tx.personalIdentity.findUnique({ where: { userId: persona.userId } });
  if (!identity?.identityCompletedAt) {
    throw new AppError("CONFLICT", "Complete personal identity before activating a persona.", 409);
  }
  await assertMembership(tx, persona.userId, persona.organizationId);
  if (persona.type === "CLIENT") {
    const profile = await tx.clientProfile.findUnique({ where: { personaId: persona.id } });
    if (!profile?.displayName.trim()) throw new AppError("CONFLICT", "Complete the client profile before activation.", 409);
  }
  if (persona.type === "FREELANCER") {
    const profile = await tx.freelancerProfile.findUnique({ where: { personaId: persona.id } });
    if (!profile?.headline.trim()) throw new AppError("CONFLICT", "Complete the freelancer profile before activation.", 409);
  }
  if (persona.type === "ORGANIZATION") {
    const profile = await tx.companyProfile.findUnique({ where: { organizationId: persona.organizationId } });
    if (!profile?.legalName.trim()) throw new AppError("CONFLICT", "Complete the organization profile before activation.", 409);
  }
}

export class PersonaService {
  async synchronizeOrganizationPersonas(userId: string) {
    const memberships = await prisma.membership.findMany({
      where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
      select: { organizationId: true, organization: { select: { name: true } } },
    });
    for (const membership of memberships) {
      await prisma.accountPersona.upsert({
        where: {
          userId_type_organizationId: {
            userId,
            type: "ORGANIZATION",
            organizationId: membership.organizationId,
          },
        },
        create: {
          userId,
          organizationId: membership.organizationId,
          type: "ORGANIZATION",
          status: "DRAFT",
          label: membership.organization.name,
        },
        update: { label: membership.organization.name },
      });
    }
    const activeOrganizationIds = memberships.map((membership) => membership.organizationId);
    await prisma.accountPersona.updateMany({
      where: {
        userId,
        type: "ORGANIZATION",
        status: "ACTIVE",
        ...(activeOrganizationIds.length
          ? { organizationId: { notIn: activeOrganizationIds } }
          : {}),
      },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
  }

  async overview(context: TenantContext) {
    await this.synchronizeOrganizationPersonas(context.userId);
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        personalIdentity: true,
        onboardingProgress: true,
        accountPersonas: { include: personaInclude, orderBy: [{ type: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);
    return {
      account: user,
      activePersonaId: context.activePersonaId ?? null,
      activePersonaType: context.activePersonaType ?? null,
    };
  }

  async saveOnboarding(context: TenantContext, input: OnboardingInput) {
    await assertMembership(prisma, context.userId, context.organizationId);
    return prisma.$transaction(async (tx) => {
      if (input.identity) {
        const identity = input.identity;
        await tx.user.update({
          where: { id: context.userId },
          data: { displayName: identity.displayName, preferredLocale: identity.locale },
        });
        await tx.personalIdentity.upsert({
          where: { userId: context.userId },
          create: {
            userId: context.userId,
            preferredName: identity.displayName,
            legalFirstName: identity.legalFirstName,
            legalLastName: identity.legalLastName,
            phoneCountryCode: identity.phoneCountryCode,
            phoneNumber: identity.phoneNumber,
            countryCode: identity.countryCode,
            timezone: identity.timezone,
            locale: identity.locale,
            identityCompletedAt: new Date(),
          },
          update: {
            preferredName: identity.displayName,
            legalFirstName: identity.legalFirstName,
            legalLastName: identity.legalLastName,
            phoneCountryCode: identity.phoneCountryCode,
            phoneNumber: identity.phoneNumber,
            countryCode: identity.countryCode,
            timezone: identity.timezone,
            locale: identity.locale,
            identityCompletedAt: new Date(),
          },
        });
      }

      const selected = input.selectedPersonaTypes;
      if (selected?.includes("CLIENT") || input.client) {
        let persona = await tx.accountPersona.findFirst({ where: { userId: context.userId, type: "CLIENT" } });
        persona ??= await tx.accountPersona.create({
          data: { userId: context.userId, organizationId: context.organizationId, type: "CLIENT", label: "Client" },
        });
        const identity = await tx.personalIdentity.findUniqueOrThrow({ where: { userId: context.userId } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: context.userId } });
        await tx.clientProfile.upsert({
          where: { userId: context.userId },
          create: {
            userId: context.userId,
            personaId: persona.id,
            displayName: input.client?.displayName ?? identity.preferredName,
            headline: input.client?.headline,
            about: input.client?.about,
            countryCode: identity.countryCode,
            timezone: identity.timezone,
            locale: identity.locale,
          },
          update: {
            personaId: persona.id,
            displayName: input.client?.displayName ?? user.displayName ?? identity.preferredName,
            headline: input.client?.headline,
            about: input.client?.about,
            countryCode: identity.countryCode,
            timezone: identity.timezone,
            locale: identity.locale,
          },
        });
      }

      if (selected?.includes("FREELANCER") || input.freelancer) {
        let persona = await tx.accountPersona.findFirst({ where: { userId: context.userId, type: "FREELANCER" } });
        persona ??= await tx.accountPersona.create({
          data: { userId: context.userId, organizationId: context.organizationId, type: "FREELANCER", label: input.freelancer?.headline ?? "Freelancer" },
        });
        if (input.freelancer) {
          await tx.freelancerProfile.upsert({
            where: { userId: context.userId },
            create: {
              userId: context.userId,
              personaId: persona.id,
              headline: input.freelancer.headline,
              bio: input.freelancer.bio,
              hourlyRateMinor: input.freelancer.hourlyRateMinor ? BigInt(input.freelancer.hourlyRateMinor) : undefined,
              yearsExperience: input.freelancer.yearsExperience,
              availability: input.freelancer.availability,
            },
            update: {
              personaId: persona.id,
              headline: input.freelancer.headline,
              bio: input.freelancer.bio,
              hourlyRateMinor: input.freelancer.hourlyRateMinor ? BigInt(input.freelancer.hourlyRateMinor) : undefined,
              yearsExperience: input.freelancer.yearsExperience,
              availability: input.freelancer.availability,
            },
          });
          await tx.accountPersona.update({ where: { id: persona.id }, data: { label: input.freelancer.headline } });
        }
      }

      if (selected?.includes("ORGANIZATION") || input.organization) {
        const organizationId = input.organization?.organizationId ?? context.organizationId;
        await assertMembership(tx, context.userId, organizationId);
        const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
        await tx.accountPersona.upsert({
          where: { userId_type_organizationId: { userId: context.userId, type: "ORGANIZATION", organizationId } },
          create: { userId: context.userId, organizationId, type: "ORGANIZATION", label: organization.name },
          update: { label: organization.name },
        });
        if (input.organization) {
          await tx.companyProfile.upsert({
            where: { organizationId },
            create: {
              organizationId,
              legalName: input.organization.legalName,
              tradingName: input.organization.tradingName,
              description: input.organization.description,
              website: input.organization.website || undefined,
            },
            update: {
              legalName: input.organization.legalName,
              tradingName: input.organization.tradingName,
              description: input.organization.description,
              website: input.organization.website || null,
            },
          });
        }
      }

      await tx.onboardingProgress.upsert({
        where: { userId: context.userId },
        create: {
          userId: context.userId,
          status: "IN_PROGRESS",
          stage: input.selectedPersonaTypes ? "PROFILES" : "PERSONAS",
          selectedPersonaTypes: input.selectedPersonaTypes ?? [],
        },
        update: {
          status: "IN_PROGRESS",
          stage: input.selectedPersonaTypes ? "PROFILES" : "PERSONAS",
          ...(input.selectedPersonaTypes ? { selectedPersonaTypes: input.selectedPersonaTypes } : {}),
        },
      });
      return { saved: true };
    });
  }

  async activate(context: TenantContext, personaId: string) {
    return prisma.$transaction(async (tx) => {
      const persona = await tx.accountPersona.findFirst({
        where: { id: personaId, userId: context.userId, status: { in: ["DRAFT", "SUSPENDED", "ACTIVE"] } },
      });
      if (!persona) throw new AppError("NOT_FOUND", "Persona not found.", 404);
      await assertReady(tx, persona);
      if (persona.status === "ACTIVE") return persona;
      const updated = await tx.accountPersona.update({
        where: { id: persona.id },
        data: { status: "ACTIVE", activatedAt: new Date(), suspendedAt: null },
      });
      await tx.personaEvent.create({
        data: {
          personaId: persona.id,
          actorUserId: context.userId,
          organizationId: persona.organizationId,
          type: persona.status === "SUSPENDED" ? "REACTIVATED" : "ACTIVATED",
          fromStatus: persona.status,
          toStatus: "ACTIVE",
          sessionId: context.sessionId,
        },
      });
      return updated;
    });
  }

  async completeOnboarding(context: TenantContext, preferredPersonaId?: string) {
    return prisma.$transaction(async (tx) => {
      const progress = await tx.onboardingProgress.findUnique({ where: { userId: context.userId } });
      if (!progress || !progress.selectedPersonaTypes.length) {
        throw new AppError("CONFLICT", "Choose at least one persona before completing onboarding.", 409);
      }
      const personas = await tx.accountPersona.findMany({
        where: {
          userId: context.userId,
          status: { not: "ARCHIVED" },
          OR: [
            ...(progress.selectedPersonaTypes.includes("CLIENT") ? [{ type: "CLIENT" as const }] : []),
            ...(progress.selectedPersonaTypes.includes("FREELANCER") ? [{ type: "FREELANCER" as const }] : []),
            ...(progress.selectedPersonaTypes.includes("ORGANIZATION") ? [{ type: "ORGANIZATION" as const, organizationId: context.organizationId }] : []),
          ],
        },
      });
      const types = new Set(personas.map((persona) => persona.type));
      if (progress.selectedPersonaTypes.some((type) => !types.has(type))) {
        throw new AppError("CONFLICT", "Complete every selected persona profile before continuing.", 409);
      }
      for (const persona of personas) {
        await assertReady(tx, persona);
        if (persona.status !== "ACTIVE") {
          await tx.accountPersona.update({ where: { id: persona.id }, data: { status: "ACTIVE", activatedAt: new Date(), suspendedAt: null } });
          await tx.personaEvent.create({ data: { personaId: persona.id, actorUserId: context.userId, organizationId: persona.organizationId, type: "ACTIVATED", fromStatus: persona.status, toStatus: "ACTIVE", sessionId: context.sessionId } });
        }
      }
      const preferred = preferredPersonaId
        ? personas.find((persona) => persona.id === preferredPersonaId)
        : personas.find((persona) => persona.type === "CLIENT") ?? personas[0];
      if (!preferred) throw new AppError("FORBIDDEN", "Preferred persona is not part of this onboarding.", 403);
      await tx.onboardingProgress.update({ where: { userId: context.userId }, data: { status: "COMPLETED", stage: "COMPLETE", completedAt: new Date() } });
      await tx.personaEvent.create({ data: { personaId: preferred.id, actorUserId: context.userId, organizationId: preferred.organizationId, type: "ONBOARDING_COMPLETED", toStatus: "ACTIVE", sessionId: context.sessionId, metadata: metadata({ selectedPersonaTypes: progress.selectedPersonaTypes }) } });
      return { completed: true, preferredPersonaId: preferred.id };
    });
  }

  async switchPersona(context: TenantContext, personaId: string) {
    if (!context.sessionId) throw new AppError("UNAUTHORIZED", "Active session required.", 401);
    const persona = await prisma.accountPersona.findFirst({
      where: {
        id: personaId,
        userId: context.userId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!persona) throw new AppError("FORBIDDEN", "Persona access denied.", 403);
    await assertMembership(prisma, context.userId, persona.organizationId);
    const updated = await prisma.authSession.updateMany({
      where: { id: context.sessionId, userId: context.userId, status: "ACTIVE" },
      data: { organizationId: persona.organizationId, activePersonaId: persona.id, lastSeenAt: new Date() },
    });
    if (updated.count !== 1) throw new AppError("UNAUTHORIZED", "Session is no longer active.", 401);
    await prisma.$transaction([
      prisma.accountPersona.update({ where: { id: persona.id }, data: { lastUsedAt: new Date() } }),
      prisma.personaEvent.create({ data: { personaId: persona.id, actorUserId: context.userId, organizationId: persona.organizationId, type: "SWITCHED", toStatus: "ACTIVE", sessionId: context.sessionId } }),
      prisma.auditEvent.create({ data: { organizationId: persona.organizationId, actorUserId: context.userId, action: "persona.switched", resourceType: "AccountPersona", resourceId: persona.id, outcome: "SUCCESS", metadata: metadata({ type: persona.type }) } }),
    ]);
    const accessToken = await signAccessToken({
      sub: context.userId,
      sessionId: context.sessionId,
      organizationId: persona.organizationId,
      activePersonaId: persona.id,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    return {
      accessToken,
      persona: { id: persona.id, type: persona.type, label: persona.label, organization: persona.organization },
      redirectTo: "/dashboard",
    };
  }
}
