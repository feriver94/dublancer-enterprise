import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const rating = z.number().int().min(1).max(5);

export const profileTargetSchema = z.object({
  resourceType: z.enum(["CLIENT_PROFILE", "FREELANCER_PROFILE", "ORGANIZATION_PROFILE"]),
  resourceId: id,
});

export const profileActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SAVE"), active: z.boolean(), freelancerProfileId: id.optional(), providerOrganizationId: id.optional() })
    .refine((value) => Number(Boolean(value.freelancerProfileId)) + Number(Boolean(value.providerOrganizationId)) === 1, "Select exactly one provider target."),
  z.object({ action: z.literal("FOLLOW"), active: z.boolean(), target: profileTargetSchema }),
  z.object({ action: z.literal("INVITE"), listingId: id, freelancerProfileId: id.optional(), providerOrganizationId: id.optional(), message: z.string().trim().max(2_000).optional(), expiresAt: z.coerce.date().optional() })
    .refine((value) => Number(Boolean(value.freelancerProfileId)) + Number(Boolean(value.providerOrganizationId)) === 1, "Select exactly one invitation target."),
]);

export const invitationQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN", "EXPIRED"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const invitationDecisionSchema = z.object({
  decision: z.enum(["ACCEPTED", "DECLINED"]),
  expectedVersion: z.number().int().positive(),
});

export const providerCompareSchema = z.object({
  ids: z.array(id).min(2).max(4).refine((ids) => new Set(ids).size === ids.length, "Provider IDs must be unique."),
});

export const proposalEditSchema = z.object({
  coverLetter: z.string().trim().min(20).max(10_000),
  bidMinor: z.coerce.bigint().nonnegative(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  estimatedDays: z.number().int().min(1).max(3650).optional(),
  submit: z.boolean(),
  expectedVersion: z.number().int().positive(),
});

export const clientReviewSchema = z.object({
  overall: rating,
  quality: rating,
  communication: rating,
  delivery: rating,
  expertise: rating,
  professionalism: rating,
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(3).max(5_000),
});

export const providerReviewSchema = z.object({
  overall: rating,
  hiringClarity: rating,
  communication: rating,
  paymentReliability: rating,
  professionalConduct: rating,
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(3).max(5_000),
});

export const governedReviewSchema = z.union([clientReviewSchema, providerReviewSchema]);

export const aiProfileAssistanceSchema = z.object({
  useCase: z.enum([
    "FREELANCER_HEADLINE",
    "FREELANCER_SUMMARY",
    "FREELANCER_COMPLETENESS",
    "FREELANCER_SKILL_GAPS",
    "FREELANCER_PORTFOLIO",
    "FREELANCER_CAPABILITY",
    "FREELANCER_OPPORTUNITY_MATCH",
    "FREELANCER_RATE_POSITIONING",
    "CLIENT_HIRING_PROFILE",
    "CLIENT_PROJECT_BRIEF",
    "CLIENT_SKILL_SUGGESTIONS",
    "CLIENT_PROVIDER_COMPARISON",
    "CLIENT_SCOPE_RISK",
  ]),
  projectId: id.optional(),
  portfolioItemId: id.optional(),
  listingId: id.optional(),
  providerIds: z.array(id).max(4).optional(),
  userContext: z.string().trim().max(2_000).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});
