import { prisma } from "@/lib/database/prisma";
import { requireActivePersona } from "@/lib/authorization/persona-policy";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { ProfileCompletionService } from "@/lib/profile/completion";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { PhaseCMarketplaceService } from "@/lib/services/phase-c-marketplace.service";
import type { TenantContext } from "@/lib/tenancy/context";

type AssistanceInput = {
  useCase: string;
  projectId?: string;
  portfolioItemId?: string;
  listingId?: string;
  providerIds?: string[];
  userContext?: string;
  idempotencyKey: string;
};

const publicVisibility = ["PUBLIC", "VERIFIED"] as const;

export class PhaseCAiAssistanceService {
  private async freelancerInput(context: TenantContext, input: AssistanceInput) {
    requireActivePersona(context, ["FREELANCER"]);
    const profile = await prisma.freelancerProfile.findFirst({
      where: { userId: context.userId, personaId: context.activePersonaId, deletedAt: null },
      select: {
        id: true, headline: true, bio: true, availability: true, yearsExperience: true, countryCode: true,
        languages: true, industries: true, services: true, fixedPriceAvailable: true,
        skills: { select: { proficiency: true, yearsExperience: true, verifiedAt: true, skill: { select: { nameEn: true, slug: true } } } },
        portfolioItems: { where: { deletedAt: null, visibility: { in: [...publicVisibility] } }, select: { id: true, title: true, description: true, contentType: true }, take: 30 },
      },
    });
    if (!profile) throw new AppError("CONFLICT", "Complete the freelancer profile before requesting assistance.", 409);
    if (input.portfolioItemId && !profile.portfolioItems.some((item) => item.id === input.portfolioItemId)) {
      throw new AppError("NOT_FOUND", "Public portfolio item not found for the active freelancer persona.", 404);
    }
    const completion = await new ProfileCompletionService().forUser(context.userId);
    return { persona: "FREELANCER", profile, completion: completion.freelancer, selectedPortfolioItemId: input.portfolioItemId ?? null };
  }

  private async clientInput(context: TenantContext, input: AssistanceInput) {
    requireActivePersona(context, ["CLIENT", "ORGANIZATION"]);
    const profile = context.activePersonaType === "CLIENT"
      ? await prisma.clientProfile.findFirst({
          where: { userId: context.userId, personaId: context.activePersonaId ?? "__missing__", deletedAt: null },
          select: { displayName: true, headline: true, about: true, industry: true, companySize: true, countryCode: true, languages: true, hiringAvailable: true, hiringPreferences: true, engagementModels: true },
        })
      : await prisma.companyProfile.findFirst({
          where: { organizationId: context.organizationId, deletedAt: null },
          select: { legalName: true, tradingName: true, description: true, industry: true, countryCode: true, services: true, technologies: true },
        });
    if (!profile) throw new AppError("CONFLICT", "Complete the active hiring profile before requesting assistance.", 409);
    const listing = input.listingId
      ? await prisma.marketplaceListing.findFirst({
          where: { id: input.listingId, organizationId: context.organizationId },
          select: { id: true, title: true, description: true, engagementType: true, experienceLevel: true, budgetMinMinor: true, budgetMaxMinor: true, currency: true, remoteAllowed: true, skills: { select: { skill: { select: { nameEn: true, slug: true } } } } },
        })
      : null;
    if (input.listingId && !listing) throw new AppError("NOT_FOUND", "Hiring project not found for the active client context.", 404);
    const providers = input.providerIds?.length ? await new PhaseCMarketplaceService().compare(context, input.providerIds) : [];
    return {
      persona: context.activePersonaType,
      profile,
      listing: listing ? { ...listing, budgetMinMinor: listing.budgetMinMinor?.toString() ?? null, budgetMaxMinor: listing.budgetMaxMinor?.toString() ?? null } : null,
      providers,
    };
  }

  async request(context: TenantContext, input: AssistanceInput) {
    const freelancerUseCase = input.useCase.startsWith("FREELANCER_");
    const scopedInput = freelancerUseCase
      ? await this.freelancerInput(context, input)
      : await this.clientInput(context, input);
    const project = input.projectId
      ? await prisma.project.findFirst({ where: { id: input.projectId, organizationId: context.organizationId }, select: { id: true, title: true, description: true, status: true } })
      : null;
    if (input.projectId && !project) throw new AppError("NOT_FOUND", "Project not found for the active organization.", 404);
    try {
      const run = await new AiGovernanceService().create(context, {
        useCase: input.useCase,
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
        input: {
          purpose: "Provide a draft suggestion for human review. Do not claim that it has been saved or published.",
          profileContext: scopedInput,
          project,
          userContext: input.userContext ?? null,
        },
      });
      return { available: true as const, autoApplied: false as const, run };
    } catch (error) {
      if (isAppError(error) && [403, 409, 429, 503].includes(error.statusCode)) {
        return { available: false as const, autoApplied: false as const, reason: "POLICY_OR_PROVIDER_UNAVAILABLE" as const };
      }
      throw error;
    }
  }
}
