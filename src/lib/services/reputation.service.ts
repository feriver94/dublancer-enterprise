import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

const publicVisibility = ["PUBLIC", "VERIFIED"] as const;
const rounded = (value: number | null | undefined) => value == null ? null : Math.round(value * 100) / 100;
const rate = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 100) : null;

export class ReputationService {
  async provider(freelancerProfileId: string) {
    const profile = await prisma.freelancerProfile.findFirst({
      where: { id: freelancerProfileId, deletedAt: null, isPublic: true, visibility: { in: [...publicVisibility] }, persona: { status: "ACTIVE" } },
      select: { id: true, userId: true },
    });
    if (!profile) throw new AppError("NOT_FOUND", "Freelancer profile not found.", 404);

    const reviewWhere = {
      status: "PUBLISHED" as const,
      OR: [
        { subjectFreelancerProfileId: profile.id },
        { subjectFreelancerProfileId: null, revieweeUserId: profile.userId, reviewerParty: "CLIENT" as const },
      ],
    };
    const [reviews, contracts] = await Promise.all([
      prisma.review.findMany({
        where: reviewWhere,
        select: { id: true, rating: true, quality: true, communication: true, delivery: true, expertise: true, professionalism: true, title: true, body: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 100,
      }),
      prisma.contract.findMany({
        where: { OR: [{ providerProfileId: profile.id }, { providerProfileId: null, proposal: { freelancerProfileId: profile.id } }] },
        select: { organizationId: true, status: true, milestones: { select: { dueAt: true, releasedAt: true, status: true } } },
        take: 1_000,
      }),
    ]);
    const average = (key: keyof (typeof reviews)[number]) => {
      const values = reviews.map((review) => review[key]).filter((value): value is number => typeof value === "number");
      return rounded(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
    };
    const completed = contracts.filter((contract) => contract.status === "COMPLETED");
    const clientCounts = new Map<string, number>();
    for (const contract of completed) clientCounts.set(contract.organizationId, (clientCounts.get(contract.organizationId) ?? 0) + 1);
    const delivered = contracts.flatMap((contract) => contract.milestones).filter((milestone) => milestone.status === "RELEASED" && milestone.releasedAt);
    const onTime = delivered.filter((milestone) => !milestone.dueAt || milestone.releasedAt! <= milestone.dueAt).length;

    return {
      status: reviews.length ? "AVAILABLE" : "NOT_ENOUGH_DATA",
      overall: average("rating"),
      reviewCount: reviews.length,
      dimensions: {
        quality: average("quality"),
        communication: average("communication"),
        delivery: average("delivery"),
        expertise: average("expertise"),
        professionalism: average("professionalism"),
      },
      repeatClientRate: rate([...clientCounts.values()].filter((count) => count > 1).length, clientCounts.size),
      completionRate: rate(completed.length, contracts.filter((contract) => !["DRAFT", "PENDING_SIGNATURES"].includes(contract.status)).length),
      onTimeDeliveryRate: rate(onTime, delivered.length),
      clientSatisfaction: rate(reviews.filter((review) => review.rating >= 4).length, reviews.length),
      recentReviews: reviews.slice(0, 10),
    };
  }

  async client(clientProfileId: string) {
    const profile = await prisma.clientProfile.findFirst({
      where: { id: clientProfileId, deletedAt: null, visibility: { in: [...publicVisibility] }, persona: { status: "ACTIVE" } },
      select: { id: true, userId: true, persona: { select: { organizationId: true } } },
    });
    if (!profile) throw new AppError("NOT_FOUND", "Client profile not found.", 404);
    const reviews = await prisma.review.findMany({
      where: { status: "PUBLISHED", subjectClientProfileId: profile.id, reviewerParty: "PROVIDER" },
      select: { id: true, rating: true, hiringClarity: true, communication: true, paymentReliability: true, professionalConduct: true, title: true, body: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
    const average = (key: keyof (typeof reviews)[number]) => {
      const values = reviews.map((review) => review[key]).filter((value): value is number => typeof value === "number");
      return rounded(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
    };
    const completed = await prisma.contract.findMany({
      where: { organizationId: profile.persona.organizationId, status: "COMPLETED" },
      select: { providerProfileId: true, providerUserId: true, providerOrganizationId: true },
      take: 1_000,
    });
    const providers = new Map<string, number>();
    for (const contract of completed) {
      const key = contract.providerProfileId ?? contract.providerOrganizationId ?? contract.providerUserId;
      if (key) providers.set(key, (providers.get(key) ?? 0) + 1);
    }

    return {
      status: reviews.length ? "AVAILABLE" : "NOT_ENOUGH_DATA",
      overall: average("rating"),
      reviewCount: reviews.length,
      dimensions: {
        hiringClarity: average("hiringClarity"),
        communication: average("communication"),
        paymentReliability: average("paymentReliability"),
        professionalConduct: average("professionalConduct"),
      },
      repeatHireRate: rate([...providers.values()].filter((count) => count > 1).length, providers.size),
      recentReviews: reviews.slice(0, 10),
    };
  }
}
