import { Prisma, type AccountPersonaType, type ProfileContentType, type ProfileVisibility } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireActivePersona, requirePersonaPermission } from "@/lib/authorization/persona-policy";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import type { PlatformPermission } from "@/lib/authorization/permissions";
import type { TenantContext } from "@/lib/tenancy/context";
import {
  certificationContentSchema,
  educationContentSchema,
  experienceContentSchema,
  portfolioContentSchema,
  socialLinkContentSchema,
  type contentKindSchema,
  type updateProfileSettingsSchema,
} from "@/lib/validation/profile";
import type { z } from "zod";
import { ProfileCompletionService } from "@/lib/profile/completion";

type SettingsInput = z.infer<typeof updateProfileSettingsSchema>;
type ContentKind = z.infer<typeof contentKindSchema>;

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const portfolioTypes: Record<"portfolio" | "case-study" | "publication" | "research", ProfileContentType> = {
  portfolio: "PORTFOLIO",
  "case-study": "CASE_STUDY",
  publication: "PUBLICATION",
  research: "RESEARCH",
};

function isPortfolioKind(kind: ContentKind): kind is keyof typeof portfolioTypes {
  return kind in portfolioTypes;
}

async function audit(context: TenantContext, action: string, resourceType: string, resourceId: string, fields: string[]) {
  await prisma.auditEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      resourceType,
      resourceId,
      outcome: "SUCCESS",
      metadata: json({ fields }),
    },
  });
}

async function assertOrganizationMembership(userId: string, organizationId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!membership) throw new AppError("FORBIDDEN", "Active organization membership required.", 403);
}

async function assertVisibility(userId: string, requested: ProfileVisibility, organizationVerified = false) {
  if (requested === "SUSPENDED" || requested === "ARCHIVED") {
    throw new AppError("FORBIDDEN", "Suspended and archived profile states are controlled by platform governance.", 403);
  }
  if (requested === "VERIFIED" && !organizationVerified) {
    const credential = await prisma.verifiedCredential.findFirst({ where: { subjectUserId: userId, status: "VERIFIED" }, select: { id: true } });
    if (!credential) throw new AppError("FORBIDDEN", "A verified credential is required for verified visibility.", 403);
  }
}

async function freelancerProfile(context: TenantContext) {
  await requirePersonaPermission(context, "marketplace.profile.manage", ["FREELANCER"]);
  const profile = await prisma.freelancerProfile.findFirst({ where: { userId: context.userId, deletedAt: null }, select: { id: true } });
  if (!profile) throw new AppError("CONFLICT", "Complete the freelancer profile first.", 409);
  return profile;
}

export class ProfileManagementService {
  async settings(context: TenantContext) {
    const [user, organizations, completion, authorization] = await Promise.all([
      prisma.user.findUnique({
        where: { id: context.userId },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          preferredLocale: true,
          personalIdentity: true,
          clientProfile: true,
          freelancerProfile: {
            include: {
              skills: { include: { skill: true } },
              portfolioItems: { where: { deletedAt: null }, orderBy: [{ contentType: "asc" }, { sortOrder: "asc" }] },
              workExperiences: { where: { deletedAt: null }, orderBy: { startedAt: "desc" } },
              educations: { where: { deletedAt: null }, orderBy: { endedAt: "desc" } },
              certifications: { where: { deletedAt: null }, orderBy: { issuedAt: "desc" } },
            },
          },
          profileSocialLinks: { where: { deletedAt: null }, orderBy: [{ personaType: "asc" }, { platform: "asc" }] },
        },
      }),
      prisma.organization.findMany({
        where: { memberships: { some: { userId: context.userId, status: "ACTIVE" } }, status: "ACTIVE" },
        select: { id: true, name: true, slug: true, companyProfile: true },
        orderBy: { name: "asc" },
      }),
      new ProfileCompletionService().forUser(context.userId),
      resolveAuthorization(context),
    ]);
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);
    const can = (permission: PlatformPermission) => authorization.isPlatformAdmin || authorization.permissions.includes(permission);
    const clientActive = context.activePersonaType === "CLIENT";
    const freelancerActive = context.activePersonaType === "FREELANCER";
    const organizationActive = context.activePersonaType === "ORGANIZATION";
    return {
      account: user,
      organizations,
      completion,
      activePersonaType: context.activePersonaType,
      activeOrganizationId: context.organizationId,
      capabilities: {
        editClient: clientActive && can("marketplace.listing.manage"),
        editFreelancer: freelancerActive && can("marketplace.profile.manage"),
        manageContent: freelancerActive && can("marketplace.profile.manage"),
        editOrganizationIds: organizationActive && can("organization.update") ? [context.organizationId] : [],
      },
    };
  }

  async updateSettings(context: TenantContext, input: SettingsInput) {
    if (input.section === "personal") {
      const data = input.data;
      try {
        await prisma.$transaction([
          prisma.user.update({ where: { id: context.userId }, data: { username: data.username, displayName: data.displayName, preferredLocale: data.locale } }),
          prisma.personalIdentity.upsert({
            where: { userId: context.userId },
            create: { userId: context.userId, preferredName: data.preferredName, countryCode: data.countryCode, timezone: data.timezone, locale: data.locale, identityCompletedAt: new Date() },
            update: { preferredName: data.preferredName, countryCode: data.countryCode, timezone: data.timezone, locale: data.locale, identityCompletedAt: new Date() },
          }),
        ]);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("CONFLICT", "That username is already in use.", 409);
        throw error;
      }
      await audit(context, "profile.personal.updated", "User", context.userId, Object.keys(data));
      return this.settings(context);
    }

    if (input.section === "client") {
      requireActivePersona(context, ["CLIENT"]);
      await requirePermission(context, "marketplace.listing.manage");
      await assertVisibility(context.userId, input.data.visibility);
      const { version, hiringPreferences, ...data } = input.data;
      const changed = await prisma.clientProfile.updateMany({
        where: { userId: context.userId, version, deletedAt: null },
        data: { ...data, hiringPreferences: hiringPreferences ? json(hiringPreferences) : Prisma.JsonNull, version: { increment: 1 } },
      });
      if (!changed.count) throw new AppError("CONFLICT", "The client profile changed in another session. Reload and retry.", 409);
      const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { userId: context.userId } });
      await audit(context, "profile.client.updated", "ClientProfile", profile.id, Object.keys(data));
      return profile;
    }

    if (input.section === "freelancer") {
      await requirePersonaPermission(context, "marketplace.profile.manage", ["FREELANCER"]);
      await assertVisibility(context.userId, input.data.visibility);
      const { version, hourlyRateMinor, ...data } = input.data;
      const searchText = [data.headline, data.bio, ...data.services, ...data.industries].filter(Boolean).join(" ");
      const isPublished = data.visibility === "PUBLIC" || data.visibility === "VERIFIED";
      const changed = await prisma.freelancerProfile.updateMany({
        where: { userId: context.userId, version, deletedAt: null },
        data: {
          ...data,
          hourlyRateMinor: hourlyRateMinor ? BigInt(hourlyRateMinor) : null,
          isPublic: isPublished,
          searchText: isPublished ? searchText : null,
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new AppError("CONFLICT", "The freelancer profile changed in another session. Reload and retry.", 409);
      const profile = await prisma.freelancerProfile.findUniqueOrThrow({ where: { userId: context.userId } });
      await audit(context, "profile.freelancer.updated", "FreelancerProfile", profile.id, Object.keys(data));
      return profile;
    }

    requireActivePersona(context, ["ORGANIZATION"]);
    await requirePermission(context, "organization.update");
    if (input.data.organizationId !== context.organizationId) throw new AppError("FORBIDDEN", "Switch to that organization persona before editing its identity.", 403);
    await assertOrganizationMembership(context.userId, input.data.organizationId);
    const current = await prisma.companyProfile.findUnique({ where: { organizationId: input.data.organizationId }, select: { verifiedAt: true } });
    await assertVisibility(context.userId, input.data.visibility, Boolean(current?.verifiedAt));
    const { organizationId, version, locations, portfolio, ...data } = input.data;
    const changed = await prisma.companyProfile.updateMany({
      where: { organizationId, version, deletedAt: null },
      data: { ...data, locations: json(locations), portfolio: json(portfolio), version: { increment: 1 } },
    });
    if (!changed.count) throw new AppError("CONFLICT", "The organization profile changed in another session. Reload and retry.", 409);
    const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { organizationId } });
    await audit(context, "profile.organization.updated", "CompanyProfile", profile.id, Object.keys(data));
    return profile;
  }

  async listContent(context: TenantContext, kind: ContentKind) {
    if (kind === "social-link") {
      requireActivePersona(context, ["CLIENT", "FREELANCER"]);
      return prisma.profileSocialLink.findMany({ where: { userId: context.userId, personaType: context.activePersonaType as AccountPersonaType, deletedAt: null }, orderBy: { platform: "asc" } });
    }
    const profile = await freelancerProfile(context);
    if (isPortfolioKind(kind)) return prisma.portfolioItem.findMany({ where: { freelancerProfileId: profile.id, contentType: portfolioTypes[kind], deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    if (kind === "experience") return prisma.workExperience.findMany({ where: { freelancerProfileId: profile.id, deletedAt: null }, orderBy: { startedAt: "desc" } });
    if (kind === "education") return prisma.education.findMany({ where: { freelancerProfileId: profile.id, deletedAt: null }, orderBy: { endedAt: "desc" } });
    return prisma.certification.findMany({ where: { freelancerProfileId: profile.id, deletedAt: null }, orderBy: { issuedAt: "desc" } });
  }

  async createContent(context: TenantContext, kind: ContentKind, payload: unknown) {
    if (kind === "social-link") {
      const input = socialLinkContentSchema.parse(payload);
      await assertVisibility(context.userId, input.visibility);
      requireActivePersona(context, [input.personaType]);
      const row = await prisma.profileSocialLink.upsert({
        where: { userId_personaType_platform: { userId: context.userId, personaType: input.personaType, platform: input.platform } },
        create: { userId: context.userId, ...input, version: 1 },
        update: { url: input.url, visibility: input.visibility, deletedAt: null, version: { increment: 1 } },
      });
      await audit(context, "profile.social-link.created", "ProfileSocialLink", row.id, Object.keys(input));
      return row;
    }
    const profile = await freelancerProfile(context);
    if (isPortfolioKind(kind)) {
      const input = portfolioContentSchema.parse(payload);
      await assertVisibility(context.userId, input.visibility);
      const row = await prisma.portfolioItem.create({ data: { freelancerProfileId: profile.id, contentType: portfolioTypes[kind], ...input, version: 1 } });
      await audit(context, `profile.${kind}.created`, "PortfolioItem", row.id, Object.keys(input));
      return row;
    }
    if (kind === "experience") {
      const input = experienceContentSchema.parse(payload);
      await assertVisibility(context.userId, input.visibility);
      const row = await prisma.workExperience.create({ data: { freelancerProfileId: profile.id, ...input, version: 1 } });
      await audit(context, "profile.experience.created", "WorkExperience", row.id, Object.keys(input));
      return row;
    }
    if (kind === "education") {
      const input = educationContentSchema.parse(payload);
      await assertVisibility(context.userId, input.visibility);
      const row = await prisma.education.create({ data: { freelancerProfileId: profile.id, ...input, version: 1 } });
      await audit(context, "profile.education.created", "Education", row.id, Object.keys(input));
      return row;
    }
    const input = certificationContentSchema.parse(payload);
    await assertVisibility(context.userId, input.visibility);
    const row = await prisma.certification.create({ data: { freelancerProfileId: profile.id, ...input, version: 1 } });
    await audit(context, "profile.certification.created", "Certification", row.id, Object.keys(input));
    return row;
  }

  async updateContent(context: TenantContext, kind: ContentKind, id: string, payload: unknown) {
    let changed = 0;
    let resourceType = "";
    let fields: string[] = [];
    let nextVersion = 0;
    if (kind === "social-link") {
      const input = socialLinkContentSchema.parse(payload);
      await assertVisibility(context.userId, input.visibility);
      if (!input.version) throw new AppError("VALIDATION_ERROR", "A content version is required.", 422);
      const { version, ...data } = input;
      requireActivePersona(context, [input.personaType]);
      resourceType = "ProfileSocialLink";
      changed = (await prisma.profileSocialLink.updateMany({ where: { id, userId: context.userId, personaType: input.personaType, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } })).count;
      fields = Object.keys(data);
      nextVersion = version + 1;
    } else {
      const profile = await freelancerProfile(context);
      if (isPortfolioKind(kind)) {
        const input = portfolioContentSchema.parse(payload);
        await assertVisibility(context.userId, input.visibility);
        if (!input.version) throw new AppError("VALIDATION_ERROR", "A content version is required.", 422);
        const { version, ...data } = input;
        resourceType = "PortfolioItem";
        changed = (await prisma.portfolioItem.updateMany({ where: { id, freelancerProfileId: profile.id, contentType: portfolioTypes[kind], version, deletedAt: null }, data: { ...data, version: { increment: 1 } } })).count;
        fields = Object.keys(data);
        nextVersion = version + 1;
      } else if (kind === "experience") {
        const input = experienceContentSchema.parse(payload);
        await assertVisibility(context.userId, input.visibility);
        if (!input.version) throw new AppError("VALIDATION_ERROR", "A content version is required.", 422);
        const { version, ...data } = input;
        resourceType = "WorkExperience";
        changed = (await prisma.workExperience.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } })).count;
        fields = Object.keys(data);
        nextVersion = version + 1;
      } else if (kind === "education") {
        const input = educationContentSchema.parse(payload);
        await assertVisibility(context.userId, input.visibility);
        if (!input.version) throw new AppError("VALIDATION_ERROR", "A content version is required.", 422);
        const { version, ...data } = input;
        resourceType = "Education";
        changed = (await prisma.education.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } })).count;
        fields = Object.keys(data);
        nextVersion = version + 1;
      } else {
        const input = certificationContentSchema.parse(payload);
        await assertVisibility(context.userId, input.visibility);
        if (!input.version) throw new AppError("VALIDATION_ERROR", "A content version is required.", 422);
        const { version, ...data } = input;
        resourceType = "Certification";
        changed = (await prisma.certification.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } })).count;
        fields = Object.keys(data);
        nextVersion = version + 1;
      }
    }
    if (!changed) throw new AppError("CONFLICT", "The content changed, was archived, or is not owned by this account.", 409);
    await audit(context, `profile.${kind}.updated`, resourceType, id, fields);
    return { id, version: nextVersion };
  }

  async deleteContent(context: TenantContext, kind: ContentKind, id: string, version: number) {
    let changed = 0;
    let resourceType = "";
    const archived = { deletedAt: new Date(), visibility: "ARCHIVED" as const, version: { increment: 1 } };
    if (kind === "social-link") {
      requireActivePersona(context, ["CLIENT", "FREELANCER"]);
      resourceType = "ProfileSocialLink";
      changed = (await prisma.profileSocialLink.updateMany({ where: { id, userId: context.userId, personaType: context.activePersonaType as AccountPersonaType, version, deletedAt: null }, data: archived })).count;
    } else {
      const profile = await freelancerProfile(context);
      if (isPortfolioKind(kind)) {
        resourceType = "PortfolioItem";
        changed = (await prisma.portfolioItem.updateMany({ where: { id, freelancerProfileId: profile.id, contentType: portfolioTypes[kind], version, deletedAt: null }, data: archived })).count;
      } else if (kind === "experience") {
        resourceType = "WorkExperience";
        changed = (await prisma.workExperience.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: archived })).count;
      } else if (kind === "education") {
        resourceType = "Education";
        changed = (await prisma.education.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: archived })).count;
      } else {
        resourceType = "Certification";
        changed = (await prisma.certification.updateMany({ where: { id, freelancerProfileId: profile.id, version, deletedAt: null }, data: archived })).count;
      }
    }
    if (!changed) throw new AppError("CONFLICT", "The content changed, was archived, or is not owned by this account.", 409);
    await audit(context, `profile.${kind}.archived`, resourceType, id, ["visibility", "deletedAt"]);
    return { id, archived: true };
  }

  async report(context: TenantContext, input: { resourceType: string; resourceId: string; category: string; detail: string }) {
    const row = await prisma.abuseReport.create({ data: { organizationId: context.organizationId, reporterId: context.userId, ...input } });
    await audit(context, "profile.reported", input.resourceType, input.resourceId, ["category"]);
    return { id: row.id, status: row.status };
  }

  async toggleFollow(context: TenantContext, freelancerProfileId: string) {
    requireActivePersona(context, ["CLIENT", "FREELANCER", "ORGANIZATION"]);
    const target = await prisma.freelancerProfile.findFirst({
      where: { id: freelancerProfileId, deletedAt: null, visibility: { in: ["PUBLIC", "VERIFIED"] }, isPublic: true },
      select: { id: true, userId: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "Freelancer profile not found.", 404);
    if (target.userId === context.userId) throw new AppError("CONFLICT", "You cannot follow your own profile.", 409);
    const targetKey = `FREELANCER:${freelancerProfileId}`;
    const existing = await prisma.profileFollow.findUnique({ where: { userId_organizationId_targetKey: { userId: context.userId, organizationId: context.organizationId, targetKey } } });
    if (existing) {
      await prisma.profileFollow.delete({ where: { id: existing.id } });
      await audit(context, "profile.unfollowed", "FreelancerProfile", freelancerProfileId, []);
      return { following: false };
    }
    await prisma.profileFollow.create({ data: { userId: context.userId, organizationId: context.organizationId, freelancerProfileId, targetKey } });
    await audit(context, "profile.followed", "FreelancerProfile", freelancerProfileId, []);
    return { following: true };
  }
}
