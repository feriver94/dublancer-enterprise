import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { requireActivePersona, requirePersonaPermission } from "@/lib/authorization/persona-policy";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { ReputationService } from "@/lib/services/reputation.service";

type ProfileTarget = {
  resourceType: "CLIENT_PROFILE" | "FREELANCER_PROFILE" | "ORGANIZATION_PROFILE";
  resourceId: string;
};
const publicVisibility = ["PUBLIC", "VERIFIED"] as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function audit(context: TenantContext, action: string, resourceType: string, resourceId: string, metadata?: unknown) {
  await prisma.auditEvent.create({
    data: { organizationId: context.organizationId, actorUserId: context.userId, action, resourceType, resourceId, outcome: "SUCCESS", metadata: metadata === undefined ? undefined : json(metadata) },
  });
}

async function publicTarget(target: ProfileTarget) {
  if (target.resourceType === "FREELANCER_PROFILE") {
    const row = await prisma.freelancerProfile.findFirst({
      where: { id: target.resourceId, deletedAt: null, isPublic: true, visibility: { in: [...publicVisibility] }, persona: { status: "ACTIVE" } },
      select: { id: true, userId: true },
    });
    if (!row) throw new AppError("NOT_FOUND", "Freelancer profile not found.", 404);
    return { ...row, clientProfileId: null, freelancerProfileId: row.id, targetOrganizationId: null, targetKey: `FREELANCER:${row.id}` };
  }
  if (target.resourceType === "CLIENT_PROFILE") {
    const row = await prisma.clientProfile.findFirst({
      where: { id: target.resourceId, deletedAt: null, visibility: { in: [...publicVisibility] }, persona: { status: "ACTIVE" } },
      select: { id: true, userId: true },
    });
    if (!row) throw new AppError("NOT_FOUND", "Client profile not found.", 404);
    return { ...row, clientProfileId: row.id, freelancerProfileId: null, targetOrganizationId: null, targetKey: `CLIENT:${row.id}` };
  }
  const row = await prisma.organization.findFirst({
    where: { id: target.resourceId, status: "ACTIVE", companyProfile: { deletedAt: null, visibility: { in: [...publicVisibility] } } },
    select: { id: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "Organization profile not found.", 404);
  return { id: row.id, userId: null, clientProfileId: null, freelancerProfileId: null, targetOrganizationId: row.id, targetKey: `ORGANIZATION:${row.id}` };
}

export class PhaseCMarketplaceService {
  async actionState(context: TenantContext, target: ProfileTarget) {
    const row = await publicTarget(target);
    const clientMode = context.activePersonaType === "CLIENT" || context.activePersonaType === "ORGANIZATION";
    const providerMode = context.activePersonaType === "FREELANCER" || context.activePersonaType === "ORGANIZATION";
    const [saved, followed, listings] = await Promise.all([
      row.freelancerProfileId
        ? prisma.savedProvider.findFirst({ where: { userId: context.userId, organizationId: context.organizationId, freelancerProfileId: row.freelancerProfileId }, select: { id: true } })
        : row.targetOrganizationId
          ? prisma.savedProvider.findFirst({ where: { userId: context.userId, organizationId: context.organizationId, providerOrganizationId: row.targetOrganizationId }, select: { id: true } })
          : Promise.resolve(null),
      prisma.profileFollow.findUnique({ where: { userId_organizationId_targetKey: { userId: context.userId, organizationId: context.organizationId, targetKey: row.targetKey } }, select: { id: true } }),
      clientMode && (row.freelancerProfileId || row.targetOrganizationId)
        ? prisma.marketplaceListing.findMany({ where: { organizationId: context.organizationId, status: "PUBLISHED" }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 })
        : Promise.resolve([]),
    ]);
    const self = row.userId === context.userId || row.targetOrganizationId === context.organizationId;
    return {
      saved: Boolean(saved),
      following: Boolean(followed),
      listings,
      capabilities: {
        save: clientMode && !self && Boolean(row.freelancerProfileId || row.targetOrganizationId),
        follow: !self,
        invite: clientMode && !self && Boolean(row.freelancerProfileId || row.targetOrganizationId),
        compare: clientMode && Boolean(row.freelancerProfileId),
        message: !self && (clientMode || providerMode),
        openOpportunities: providerMode && target.resourceType === "CLIENT_PROFILE",
      },
    };
  }

  async save(context: TenantContext, input: { active: boolean; freelancerProfileId?: string; providerOrganizationId?: string }) {
    await requirePersonaPermission(context, "marketplace.proposal.review", ["CLIENT", "ORGANIZATION"]);
    const target = input.freelancerProfileId
      ? await publicTarget({ resourceType: "FREELANCER_PROFILE", resourceId: input.freelancerProfileId })
      : await publicTarget({ resourceType: "ORGANIZATION_PROFILE", resourceId: input.providerOrganizationId! });
    if (target.userId === context.userId || target.targetOrganizationId === context.organizationId) throw new AppError("CONFLICT", "You cannot save your own provider identity.", 409);
    const where = { userId: context.userId, organizationId: context.organizationId, freelancerProfileId: target.freelancerProfileId, providerOrganizationId: target.targetOrganizationId };
    if (input.active) {
      const existing = await prisma.savedProvider.findFirst({ where, select: { id: true } });
      if (!existing) await prisma.savedProvider.create({ data: where });
    } else {
      await prisma.savedProvider.deleteMany({ where });
    }
    await audit(context, input.active ? "marketplace.provider.saved" : "marketplace.provider.unsaved", "Provider", target.id);
    return { saved: input.active };
  }

  async follow(context: TenantContext, targetInput: ProfileTarget, active: boolean) {
    requireActivePersona(context, ["CLIENT", "FREELANCER", "ORGANIZATION"]);
    const target = await publicTarget(targetInput);
    if (target.userId === context.userId || target.targetOrganizationId === context.organizationId) throw new AppError("CONFLICT", "You cannot follow your own profile.", 409);
    const key = { userId: context.userId, organizationId: context.organizationId, targetKey: target.targetKey };
    if (active) {
      await prisma.profileFollow.upsert({
        where: { userId_organizationId_targetKey: key },
        create: { ...key, clientProfileId: target.clientProfileId, freelancerProfileId: target.freelancerProfileId, targetOrganizationId: target.targetOrganizationId },
        update: {},
      });
    } else {
      await prisma.profileFollow.deleteMany({ where: key });
    }
    await audit(context, active ? "profile.followed" : "profile.unfollowed", targetInput.resourceType, target.id);
    return { following: active };
  }

  async invite(context: TenantContext, input: { listingId: string; freelancerProfileId?: string; providerOrganizationId?: string; message?: string; expiresAt?: Date }) {
    await requirePersonaPermission(context, "marketplace.proposal.review", ["CLIENT", "ORGANIZATION"]);
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.listingId, organizationId: context.organizationId, status: "PUBLISHED" }, select: { id: true } });
    if (!listing) throw new AppError("NOT_FOUND", "Published client listing not found.", 404);
    const target = input.freelancerProfileId
      ? await publicTarget({ resourceType: "FREELANCER_PROFILE", resourceId: input.freelancerProfileId })
      : await publicTarget({ resourceType: "ORGANIZATION_PROFILE", resourceId: input.providerOrganizationId! });
    if (target.userId === context.userId || target.targetOrganizationId === context.organizationId) throw new AppError("CONFLICT", "You cannot invite your own provider identity.", 409);
    const invitation = await prisma.marketplaceInvitation.upsert({
      where: { listingId_targetKey: { listingId: listing.id, targetKey: target.targetKey } },
      create: {
        listingId: listing.id,
        clientOrganizationId: context.organizationId,
        invitedById: context.userId,
        targetKey: target.targetKey,
        freelancerProfileId: target.freelancerProfileId,
        providerOrganizationId: target.targetOrganizationId,
        message: input.message,
        expiresAt: input.expiresAt,
      },
      update: {},
    });
    await audit(context, "marketplace.invitation.created", "MarketplaceInvitation", invitation.id, { listingId: listing.id, targetKey: target.targetKey });
    return invitation;
  }

  async invitations(context: TenantContext, input: { status?: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED"; take: number }) {
    requireActivePersona(context, ["FREELANCER", "ORGANIZATION"]);
    const freelancer = context.activePersonaType === "FREELANCER"
      ? await prisma.freelancerProfile.findFirst({ where: { userId: context.userId, personaId: context.activePersonaId }, select: { id: true } })
      : null;
    return prisma.marketplaceInvitation.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(context.activePersonaType === "FREELANCER" ? { freelancerProfileId: freelancer?.id ?? "__missing__" } : { providerOrganizationId: context.organizationId }),
      },
      select: { id: true, status: true, message: true, expiresAt: true, version: true, createdAt: true, listing: { select: { id: true, title: true, status: true, organization: { select: { name: true, slug: true } } } } },
      orderBy: { createdAt: "desc" },
      take: input.take,
    });
  }

  async respond(context: TenantContext, invitationId: string, input: { decision: "ACCEPTED" | "DECLINED"; expectedVersion: number }) {
    requireActivePersona(context, ["FREELANCER", "ORGANIZATION"]);
    const freelancer = context.activePersonaType === "FREELANCER"
      ? await prisma.freelancerProfile.findFirst({ where: { userId: context.userId, personaId: context.activePersonaId }, select: { id: true } })
      : null;
    const row = await prisma.marketplaceInvitation.findFirst({
      where: { id: invitationId, ...(context.activePersonaType === "FREELANCER" ? { freelancerProfileId: freelancer?.id ?? "__missing__" } : { providerOrganizationId: context.organizationId }) },
      select: { id: true, status: true, version: true, expiresAt: true },
    });
    if (!row) throw new AppError("NOT_FOUND", "Marketplace invitation not found.", 404);
    if (row.status !== "PENDING" || (row.expiresAt && row.expiresAt <= new Date())) throw new AppError("CONFLICT", "This invitation is no longer awaiting a response.", 409);
    const changed = await prisma.marketplaceInvitation.updateMany({
      where: { id: row.id, status: "PENDING", version: input.expectedVersion },
      data: { status: input.decision, respondedById: context.userId, respondedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new AppError("CONFLICT", "Newer invitation data exists. Reload before responding.", 409, { recovery: "RELOAD", preserveInput: false });
    await audit(context, `marketplace.invitation.${input.decision.toLowerCase()}`, "MarketplaceInvitation", row.id);
    return prisma.marketplaceInvitation.findUniqueOrThrow({ where: { id: row.id } });
  }

  async compare(context: TenantContext, ids: string[]) {
    await requirePersonaPermission(context, "marketplace.listing.read", ["CLIENT", "ORGANIZATION"]);
    const profiles = await prisma.freelancerProfile.findMany({
      where: { id: { in: ids }, deletedAt: null, isPublic: true, visibility: { in: [...publicVisibility] }, persona: { status: "ACTIVE" } },
      select: {
        id: true, headline: true, availability: true, hourlyRateMinor: true, currency: true, yearsExperience: true, countryCode: true, languages: true, services: true,
        skills: { select: { verifiedAt: true, skill: { select: { slug: true, nameEn: true, nameAr: true } } }, orderBy: { yearsExperience: "desc" } },
        _count: { select: { portfolioItems: { where: { deletedAt: null, visibility: { in: [...publicVisibility] } } } } },
        user: { select: { username: true, verifiedCredentials: { where: { status: "VERIFIED" }, select: { type: true } } } },
      },
    });
    if (profiles.length !== ids.length) throw new AppError("NOT_FOUND", "One or more providers are not publicly comparable.", 404);
    const reputations = await Promise.all(profiles.map((profile) => new ReputationService().provider(profile.id)));
    const byId = new Map(profiles.map((profile, index) => [profile.id, { ...profile, hourlyRateMinor: profile.hourlyRateMinor?.toString() ?? null, reputation: reputations[index], href: `/u/${profile.user.username}/freelancer` }]));
    return ids.map((id) => byId.get(id)!);
  }
}
