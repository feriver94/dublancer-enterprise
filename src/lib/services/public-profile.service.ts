import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

const publicVisibility = ["PUBLIC", "VERIFIED"] as const;

const actionLinks = (resourceType: "CLIENT_PROFILE" | "FREELANCER_PROFILE" | "ORGANIZATION_PROFILE", resourceId: string, username?: string) => ({
  share: username ? `/u/${username}/${resourceType === "CLIENT_PROFILE" ? "client" : "freelancer"}` : `/org/${resourceId}`,
  report: { endpoint: "/api/profiles/report", resourceType, resourceId },
});

const verifiedTypes = (credentials: Array<{ type: string; status: string }>) =>
  new Set(credentials.filter((credential) => credential.status === "VERIFIED").map((credential) => credential.type.toUpperCase()));

export class PublicProfileService {
  async client(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        createdAt: true,
        emailVerified: true,
        clientProfile: {
          where: { deletedAt: null, visibility: { in: [...publicVisibility] } },
          select: {
            id: true,
            displayName: true,
            headline: true,
            about: true,
            visibility: true,
            bannerUrl: true,
            avatarUrl: true,
            countryCode: true,
            industry: true,
            companySize: true,
            website: true,
            languages: true,
            responseTimeMinutes: true,
            hiringAvailable: true,
            showVerifiedSpend: true,
            hiringPreferences: true,
            engagementModels: true,
            persona: {
              select: {
                status: true,
                organizationId: true,
                organization: {
                  select: {
                    name: true,
                    slug: true,
                    companyProfile: { select: { visibility: true, verifiedAt: true, deletedAt: true } },
                  },
                },
              },
            },
          },
        },
        verifiedCredentials: { select: { type: true, status: true } },
        profileSocialLinks: {
          where: { personaType: "CLIENT", deletedAt: null, visibility: { in: [...publicVisibility] } },
          select: { platform: true, url: true },
          orderBy: { platform: "asc" },
        },
      },
    });
    const profile = user?.clientProfile;
    if (!user?.username || !profile || profile.persona.status !== "ACTIVE") {
      throw new AppError("NOT_FOUND", "Client profile not found.", 404);
    }

    const organizationId = profile.persona.organizationId;
    const [openProjects, activeProjects, completedProjects, contracts, spend] = await Promise.all([
      prisma.marketplaceListing.count({ where: { organizationId, status: "PUBLISHED" } }),
      prisma.project.count({ where: { organizationId, status: "IN_PROGRESS" } }),
      prisma.project.count({ where: { organizationId, status: "COMPLETED" } }),
      prisma.contract.findMany({
        where: { organizationId, status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } },
        select: { providerUserId: true, providerOrganizationId: true, status: true },
      }),
      profile.showVerifiedSpend
        ? prisma.financialTransaction.aggregate({
            where: { organizationId, status: "SUCCEEDED", type: { in: ["CHARGE", "ESCROW_FUND", "ESCROW_RELEASE"] } },
            _sum: { amountMinor: true },
          })
        : Promise.resolve(null),
    ]);

    const providerKeys = contracts.map((contract) => contract.providerOrganizationId ?? contract.providerUserId).filter(Boolean) as string[];
    const counts = providerKeys.reduce<Record<string, number>>((result, key) => ({ ...result, [key]: (result[key] ?? 0) + 1 }), {});
    const hires = Object.keys(counts).length;
    const repeated = Object.values(counts).filter((count) => count > 1).length;
    const credentials = verifiedTypes(user.verifiedCredentials);
    const organizationProfile = profile.persona.organization.companyProfile;
    const organizationPublic = organizationProfile && !organizationProfile.deletedAt && publicVisibility.includes(organizationProfile.visibility as typeof publicVisibility[number]);

    return {
      type: "client",
      username: user.username,
      profile: {
        id: profile.id,
        bannerUrl: profile.bannerUrl,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        headline: profile.headline,
        about: profile.about,
        visibility: profile.visibility,
        countryCode: profile.countryCode,
        industry: profile.industry,
        companySize: profile.companySize,
        website: profile.website,
        languages: profile.languages,
        memberSince: user.createdAt,
        responseTimeMinutes: profile.responseTimeMinutes,
        hiringAvailable: profile.hiringAvailable,
        hiringPreferences: profile.hiringPreferences,
        engagementModels: profile.engagementModels,
        socialLinks: user.profileSocialLinks,
      },
      verification: {
        identity: Boolean(user.emailVerified) || credentials.has("IDENTITY"),
        business: Boolean(organizationProfile?.verifiedAt) || credentials.has("BUSINESS"),
        payment: [...credentials].some((type) => type.includes("PAYMENT")),
      },
      stats: {
        openProjects,
        activeProjects,
        completedProjects,
        activeContracts: contracts.filter((contract) => contract.status === "ACTIVE" || contract.status === "PAUSED").length,
        verifiedSpendMinor: profile.showVerifiedSpend ? (spend?._sum.amountMinor ?? BigInt(0)).toString() : null,
        numberOfHires: hires,
        repeatHireRate: hires ? Math.round((repeated / hires) * 100) : 0,
        clientRating: { value: null, count: 0, deferredTo: "Phase C" },
      },
      organization: organizationPublic ? { name: profile.persona.organization.name, slug: profile.persona.organization.slug } : null,
      actions: actionLinks("CLIENT_PROFILE", profile.id, user.username),
    };
  }

  async freelancer(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        createdAt: true,
        emailVerified: true,
        freelancerProfile: {
          where: { deletedAt: null, isPublic: true, visibility: { in: [...publicVisibility] } },
          select: {
            id: true,
            headline: true,
            bio: true,
            hourlyRateMinor: true,
            currency: true,
            availability: true,
            countryCode: true,
            yearsExperience: true,
            visibility: true,
            bannerUrl: true,
            avatarUrl: true,
            languages: true,
            industries: true,
            services: true,
            fixedPriceAvailable: true,
            resumeUrl: true,
            videoUrl: true,
            githubUrl: true,
            linkedinUrl: true,
            persona: { select: { status: true } },
            skills: { select: { proficiency: true, yearsExperience: true, verifiedAt: true, skill: { select: { slug: true, nameEn: true, nameAr: true } } }, orderBy: { yearsExperience: "desc" } },
            portfolioItems: {
              where: { deletedAt: null, visibility: { in: [...publicVisibility] } },
              select: { id: true, title: true, description: true, projectUrl: true, mediaUrl: true, completedAt: true, contentType: true },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            },
            workExperiences: {
              where: { deletedAt: null, visibility: { in: [...publicVisibility] } },
              select: { id: true, companyName: true, title: true, description: true, startedAt: true, endedAt: true },
              orderBy: { startedAt: "desc" },
            },
            educations: {
              where: { deletedAt: null, visibility: { in: [...publicVisibility] } },
              select: { id: true, institution: true, degree: true, fieldOfStudy: true, description: true, startedAt: true, endedAt: true },
              orderBy: { endedAt: "desc" },
            },
            certifications: {
              where: { deletedAt: null, visibility: { in: [...publicVisibility] } },
              select: { id: true, name: true, issuer: true, credentialId: true, credentialUrl: true, issuedAt: true, expiresAt: true },
              orderBy: { issuedAt: "desc" },
            },
          },
        },
        verifiedCredentials: { select: { type: true, status: true } },
        profileSocialLinks: {
          where: { personaType: "FREELANCER", deletedAt: null, visibility: { in: [...publicVisibility] } },
          select: { platform: true, url: true },
          orderBy: { platform: "asc" },
        },
      },
    });
    const profile = user?.freelancerProfile;
    if (!user?.username || !profile || profile.persona?.status !== "ACTIVE") {
      throw new AppError("NOT_FOUND", "Freelancer profile not found.", 404);
    }
    const credentials = verifiedTypes(user.verifiedCredentials);
    const byType = (type: "PORTFOLIO" | "CASE_STUDY" | "PUBLICATION" | "RESEARCH") => profile.portfolioItems.filter((item) => item.contentType === type);

    return {
      type: "freelancer",
      username: user.username,
      profile: {
        id: profile.id,
        headline: profile.headline,
        summary: profile.bio,
        availability: profile.availability,
        languages: profile.languages,
        hourlyRateMinor: profile.hourlyRateMinor?.toString() ?? null,
        currency: profile.currency,
        fixedPriceAvailable: profile.fixedPriceAvailable,
        yearsExperience: profile.yearsExperience,
        countryCode: profile.countryCode,
        bannerUrl: profile.bannerUrl,
        avatarUrl: profile.avatarUrl,
        industries: profile.industries,
        services: profile.services,
        skills: profile.skills,
        portfolio: byType("PORTFOLIO"),
        caseStudies: byType("CASE_STUDY"),
        publications: byType("PUBLICATION"),
        research: byType("RESEARCH"),
        experience: profile.workExperiences,
        education: profile.educations,
        certifications: profile.certifications,
        github: profile.githubUrl,
        linkedin: profile.linkedinUrl,
        resume: profile.resumeUrl,
        videoIntroduction: profile.videoUrl ? { status: "available", url: profile.videoUrl } : { status: "placeholder", url: null },
        socialLinks: user.profileSocialLinks,
        memberSince: user.createdAt,
      },
      trustBadges: {
        identity: Boolean(user.emailVerified) || credentials.has("IDENTITY"),
        verifiedSkills: profile.skills.filter((skill) => Boolean(skill.verifiedAt)).length,
        credentials: [...credentials],
      },
      reviewsSummary: { value: null, count: 0, status: "placeholder", deferredTo: "Phase C" },
      actions: {
        invite: `/marketplace/invitations/new?provider=${profile.id}`,
        hire: `/marketplace/contracts/new?provider=${profile.id}`,
        message: `/communications/chat?user=${user.id}`,
        follow: `/api/profiles/follow/${profile.id}`,
        ...actionLinks("FREELANCER_PROFILE", profile.id, user.username),
      },
    };
  }

  async organization(slug: string) {
    const organization = await prisma.organization.findFirst({
      where: {
        slug,
        status: "ACTIVE",
        companyProfile: { deletedAt: null, visibility: { in: [...publicVisibility] } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        companyProfile: {
          select: {
            legalName: true,
            tradingName: true,
            description: true,
            website: true,
            countryCode: true,
            verifiedAt: true,
            visibility: true,
            logoUrl: true,
            bannerUrl: true,
            industry: true,
            locations: true,
            services: true,
            technologies: true,
            portfolio: true,
          },
        },
        _count: { select: { projects: { where: { status: "COMPLETED" } } } },
      },
    });
    if (!organization?.companyProfile) throw new AppError("NOT_FOUND", "Organization profile not found.", 404);
    return {
      type: "organization",
      id: organization.id,
      slug: organization.slug,
      name: organization.companyProfile.tradingName ?? organization.name,
      legalName: organization.companyProfile.legalName,
      description: organization.companyProfile.description,
      website: organization.companyProfile.website,
      countryCode: organization.companyProfile.countryCode,
      logoUrl: organization.companyProfile.logoUrl,
      bannerUrl: organization.companyProfile.bannerUrl,
      industry: organization.companyProfile.industry,
      locations: organization.companyProfile.locations,
      services: organization.companyProfile.services,
      technologies: organization.companyProfile.technologies,
      portfolio: organization.companyProfile.portfolio,
      completedProjects: organization._count.projects,
      verification: { verified: Boolean(organization.companyProfile.verifiedAt), verifiedAt: organization.companyProfile.verifiedAt },
      actions: { share: `/org/${organization.slug}`, report: { endpoint: "/api/profiles/report", resourceType: "ORGANIZATION_PROFILE" as const, resourceId: organization.id } },
    };
  }
}
