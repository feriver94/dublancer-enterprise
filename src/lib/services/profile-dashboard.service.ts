import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireActivePersona } from "@/lib/authorization/persona-policy";
import type { TenantContext } from "@/lib/tenancy/context";
import { ProfileCompletionService } from "@/lib/profile/completion";
import { ReputationService } from "@/lib/services/reputation.service";

async function unreadMessages(userId: string, organizationId: string) {
  const memberships = await prisma.chatChannelMember.findMany({
    where: { userId, isActive: true, channel: { organizationId, isArchived: false } },
    select: { lastReadSequence: true, channel: { select: { sequence: true } } },
  });
  return memberships.reduce((sum, membership) => sum + Number(membership.channel.sequence - membership.lastReadSequence), 0);
}

export class ProfileDashboardService {
  async client(context: TenantContext) {
    requireActivePersona(context, ["CLIENT", "ORGANIZATION"]);
    const organizationId = context.organizationId;
    const now = new Date();
    const clientContractScope = context.activePersonaType === "CLIENT"
      ? { OR: [{ clientPersonaId: context.activePersonaId ?? "__missing__" }, { clientPersonaType: null as null, organizationId }] }
      : { OR: [{ clientPersonaType: "ORGANIZATION" as const, organizationId }, { clientPersonaType: null as null, organizationId }] };
    const [listingGroups, proposalGroups, invitationGroups, contractGroups, pendingPayments, upcomingMilestones, unread, savedFreelancers, savedAgencies, recentListings] = await Promise.all([
      prisma.marketplaceListing.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
      prisma.proposal.groupBy({ by: ["status"], where: { listing: { organizationId } }, _count: true }),
      prisma.marketplaceInvitation.groupBy({ by: ["status"], where: { clientOrganizationId: organizationId }, _count: true }),
      prisma.contract.groupBy({ by: ["status"], where: clientContractScope, _count: true, _sum: { valueMinor: true } }),
      prisma.financialTransaction.groupBy({ by: ["status", "currency"], where: { organizationId }, _count: true, _sum: { amountMinor: true } }),
      prisma.contractMilestone.findMany({
        where: { contract: clientContractScope, dueAt: { gte: now }, status: { notIn: ["RELEASED", "CANCELLED"] } },
        select: { id: true, title: true, amountMinor: true, currency: true, dueAt: true, status: true, contract: { select: { id: true, title: true } } },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      unreadMessages(context.userId, organizationId),
      prisma.savedProvider.count({ where: { organizationId, userId: context.userId, freelancerProfileId: { not: null } } }),
      prisma.savedProvider.count({ where: { organizationId, userId: context.userId, providerOrganizationId: { not: null } } }),
      prisma.marketplaceListing.findMany({
        where: { organizationId },
        select: { id: true, title: true, status: true, publishedAt: true, _count: { select: { proposals: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);
    const listings = Object.fromEntries(listingGroups.map((group) => [group.status, group._count]));
    const proposals = Object.fromEntries(proposalGroups.map((group) => [group.status, group._count]));
    const contracts = Object.fromEntries(contractGroups.map((group) => [group.status, { count: group._count, valueMinor: (group._sum.valueMinor ?? BigInt(0)).toString() }]));
    const submitted = proposalGroups.reduce((sum, group) => sum + group._count, 0);
    const accepted = proposals.ACCEPTED ?? 0;

    return {
      persona: context.activePersonaType,
      hiringOverview: {
        openProjects: listings.PUBLISHED ?? 0,
        drafts: listings.DRAFT ?? 0,
        activeContracts: (contracts.ACTIVE?.count ?? 0) + (contracts.PAUSED?.count ?? 0),
        pendingSignatures: contracts.PENDING_SIGNATURES?.count ?? 0,
      },
      openProjects: recentListings.filter((listing) => listing.status === "PUBLISHED"),
      drafts: recentListings.filter((listing) => listing.status === "DRAFT"),
      proposalPipeline: proposals,
      invitations: Object.fromEntries(invitationGroups.map((group) => [group.status, group._count])),
      contracts,
      payments: pendingPayments.map((payment) => ({ status: payment.status, currency: payment.currency, count: payment._count, amountMinor: (payment._sum.amountMinor ?? BigInt(0)).toString() })),
      upcomingMilestones: upcomingMilestones.map((milestone) => ({ ...milestone, amountMinor: milestone.amountMinor.toString() })),
      messages: { unread },
      savedFreelancers,
      savedAgencies,
      hiringAnalytics: {
        proposalsReceived: submitted,
        acceptedProposals: accepted,
        conversionRate: submitted ? Math.round((accepted / submitted) * 100) : 0,
        completedContracts: contracts.COMPLETED?.count ?? 0,
      },
      quickActions: [
        { key: "postProject", href: "/marketplace/listings/new" },
        { key: "inviteTalent", href: "/marketplace/talent" },
        { key: "reviewProposals", href: "/marketplace/proposals" },
        { key: "openMessages", href: "/communications/chat" },
      ],
    };
  }

  async freelancer(context: TenantContext) {
    requireActivePersona(context, ["FREELANCER"]);
    const profile = await prisma.freelancerProfile.findFirst({ where: { userId: context.userId, deletedAt: null }, select: { id: true } });
    if (!profile) throw new AppError("CONFLICT", "Complete the freelancer profile first.", 409);
    const now = new Date();
    const contractScope = { OR: [
      { providerPersonaId: context.activePersonaId ?? "__missing__" },
      { providerPersonaType: null as null, providerUserId: context.userId },
    ] };
    const [recommendedWork, proposalGroups, invitations, contractGroups, milestones, tasks, earnings, pendingWithdrawals, unread, reputation, completion, portfolioGroups, skills, calendarMilestones] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: { status: "PUBLISHED", visibility: "PUBLIC", proposals: { none: { freelancerProfileId: profile.id } } },
        select: { id: true, title: true, engagementType: true, budgetMinMinor: true, budgetMaxMinor: true, currency: true, remoteAllowed: true, publishedAt: true, skills: { select: { skill: { select: { nameEn: true, slug: true } } } } },
        orderBy: { publishedAt: "desc" },
        take: 8,
      }),
      prisma.proposal.groupBy({ by: ["status"], where: { freelancerProfileId: profile.id }, _count: true }),
      prisma.marketplaceInvitation.findMany({ where: { freelancerProfileId: profile.id, status: "PENDING" }, select: { id: true, status: true, message: true, expiresAt: true, version: true, createdAt: true, listing: { select: { id: true, title: true, organization: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.contract.groupBy({ by: ["status"], where: contractScope, _count: true, _sum: { valueMinor: true } }),
      prisma.contractMilestone.findMany({ where: { contract: contractScope, status: { notIn: ["RELEASED", "CANCELLED"] } }, select: { id: true, title: true, amountMinor: true, currency: true, status: true, dueAt: true, contract: { select: { id: true, title: true } } }, orderBy: { dueAt: "asc" }, take: 12 }),
      prisma.projectTask.findMany({ where: { assigneeId: context.userId, status: { notIn: ["DONE", "CANCELLED"] } }, select: { id: true, title: true, status: true, priority: true, dueAt: true, project: { select: { id: true, title: true } } }, orderBy: { dueAt: "asc" }, take: 12 }),
      prisma.financialTransaction.aggregate({ where: { status: "SUCCEEDED", type: "ESCROW_RELEASE", contract: contractScope }, _sum: { amountMinor: true }, _count: true }),
      prisma.financialTransaction.aggregate({ where: { status: { in: ["PENDING", "PROCESSING"] }, type: "PAYOUT", contract: contractScope }, _sum: { amountMinor: true }, _count: true }),
      unreadMessages(context.userId, context.organizationId),
      new ReputationService().provider(profile.id),
      new ProfileCompletionService().forUser(context.userId),
      prisma.portfolioItem.groupBy({ by: ["contentType", "visibility"], where: { freelancerProfileId: profile.id, deletedAt: null }, _count: true }),
      prisma.freelancerSkill.findMany({ where: { freelancerProfileId: profile.id }, select: { verifiedAt: true, skill: { select: { nameEn: true, slug: true } } }, orderBy: { yearsExperience: "desc" } }),
      prisma.contractMilestone.findMany({ where: { contract: contractScope, dueAt: { gte: now }, status: { notIn: ["RELEASED", "CANCELLED"] } }, select: { id: true, title: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 10 }),
    ]);

    return {
      persona: "FREELANCER",
      recommendedWork: recommendedWork.map((listing) => ({ ...listing, budgetMinMinor: listing.budgetMinMinor?.toString() ?? null, budgetMaxMinor: listing.budgetMaxMinor?.toString() ?? null })),
      invitations,
      proposals: Object.fromEntries(proposalGroups.map((group) => [group.status, group._count])),
      contracts: contractGroups.map((group) => ({ status: group.status, count: group._count, valueMinor: (group._sum.valueMinor ?? BigInt(0)).toString() })),
      milestones: milestones.map((milestone) => ({ ...milestone, amountMinor: milestone.amountMinor.toString() })),
      tasks,
      earningsSummary: { amountMinor: (earnings._sum.amountMinor ?? BigInt(0)).toString(), transactionCount: earnings._count },
      pendingWithdrawals: { amountMinor: (pendingWithdrawals._sum.amountMinor ?? BigInt(0)).toString(), count: pendingWithdrawals._count },
      messages: { unread },
      calendar: { milestones: calendarMilestones, tasks: tasks.filter((task) => task.dueAt && task.dueAt >= now) },
      reviewsSummary: reputation,
      profileCompletion: completion.freelancer,
      portfolioPerformance: portfolioGroups.map((group) => ({ contentType: group.contentType, visibility: group.visibility, count: group._count })),
      skillVerification: { total: skills.length, verified: skills.filter((skill) => Boolean(skill.verifiedAt)).length, skills },
      quickActions: [
        { key: "findWork", href: "/marketplace" },
        { key: "editProfile", href: "/settings/profiles" },
        { key: "addPortfolio", href: "/settings/profiles#portfolio" },
        { key: "openMessages", href: "/communications/chat" },
      ],
    };
  }
}
