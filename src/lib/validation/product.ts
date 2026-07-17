import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const currency = z.string().trim().regex(/^[A-Z]{3}$/).default("AED");
const minorAmount = z.coerce.bigint().nonnegative();
const optionalDate = z.coerce.date().optional();
const jsonObject = z.record(z.string(), z.unknown()).default({});

export const pageQuerySchema = z.object({
  cursor: id.optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export const marketplaceProfileSchema = z.object({
  headline: z.string().trim().min(3).max(160),
  bio: z.string().trim().max(5000).optional(),
  hourlyRateMinor: minorAmount.optional(),
  currency,
  availability: z.enum(["AVAILABLE", "LIMITED", "UNAVAILABLE"]).default("AVAILABLE"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Dubai"),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/).default("AE"),
  locale: z.enum(["en-AE", "ar-AE"]).default("en-AE"),
  yearsExperience: z.number().int().min(0).max(80).default(0),
  isPublic: z.boolean().default(true),
});

export const listingQuerySchema = pageQuerySchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "CLOSED", "AWARDED", "CANCELLED"]).optional(),
  query: z.string().trim().max(200).optional(),
});

export const createListingSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(20_000),
  engagementType: z.enum(["FIXED_PRICE", "HOURLY", "RETAINER", "EMPLOYMENT"]),
  experienceLevel: z.enum(["ENTRY", "INTERMEDIATE", "EXPERT"]).default("INTERMEDIATE"),
  budgetMinMinor: minorAmount.optional(),
  budgetMaxMinor: minorAmount.optional(),
  currency,
  visibility: z.enum(["PUBLIC", "PRIVATE", "TALENT_POOL", "INVITE_ONLY"]).default("PUBLIC"),
  locationCountry: z.string().trim().regex(/^[A-Z]{2}$/).optional(),
  remoteAllowed: z.boolean().default(true),
  applicationDeadline: optionalDate,
  workspaceProjectId: id.optional(),
  publish: z.boolean().default(false),
  skillIds: z.array(id).max(30).default([]),
}).superRefine((value, ctx) => {
  if (value.budgetMinMinor !== undefined && value.budgetMaxMinor !== undefined && value.budgetMinMinor > value.budgetMaxMinor) {
    ctx.addIssue({ code: "custom", path: ["budgetMaxMinor"], message: "Maximum budget must be at least the minimum budget." });
  }
});

export const createProposalSchema = z.object({
  listingId: id,
  coverLetter: z.string().trim().min(20).max(10_000),
  bidMinor: minorAmount,
  currency,
  estimatedDays: z.number().int().min(1).max(3650).optional(),
  submit: z.boolean().default(true),
  metadata: jsonObject.optional(),
});

export const proposalDecisionSchema = z.object({
  status: z.enum(["SHORTLISTED", "ACCEPTED", "REJECTED", "WITHDRAWN"]),
});

export const createContractSchema = z.object({
  proposalId: id.optional(),
  listingId: id.optional(),
  projectId: id.optional(),
  providerOrganizationId: id.optional(),
  providerUserId: id.optional(),
  title: z.string().trim().min(3).max(200),
  valueMinor: minorAmount,
  currency,
  taxRateBasisPoints: z.number().int().min(0).max(10_000).default(0),
  platformFeeBasisPoints: z.number().int().min(0).max(10_000).default(0),
  terms: jsonObject,
  startsAt: optionalDate,
  endsAt: optionalDate,
});

export const deliveryItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("timeEntry"), taskId: id.optional(), startedAt: z.coerce.date(), endedAt: optionalDate, durationMinutes: z.number().int().min(1).max(1440).optional(), description: z.string().trim().max(2000).optional(), billable: z.boolean().default(true) }),
  z.object({ type: z.literal("risk"), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), probability: z.number().int().min(0).max(100).default(50), impact: z.number().int().min(0).max(100).default(50), mitigation: z.string().trim().max(5000).optional(), dueAt: optionalDate }),
  z.object({ type: z.literal("deliverable"), taskId: id.optional(), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), dueAt: optionalDate }),
  z.object({ type: z.literal("changeRequest"), title: z.string().trim().min(3).max(200), description: z.string().trim().min(5).max(10_000), impact: jsonObject.optional() }),
]);

export const fileQuerySchema = pageQuerySchema.extend({
  projectId: id.optional(),
  parentId: id.nullable().optional(),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => !/[\\/:*?"<>|]/.test(value), "Folder name contains invalid characters."),
  parentId: id.optional(),
  projectId: id.optional(),
});

export const createUploadIntentSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => !/[\\/:*?"<>|]/.test(value), "File name contains invalid characters."),
  parentId: id.optional(),
  projectId: id.optional(),
  mimeType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const createAiRunSchema = z.object({
  useCase: z.string().trim().min(2).max(100),
  projectId: id.optional(),
  input: jsonObject,
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const aiTenantConfigSchema = z.object({
  enabled: z.boolean(), providerKey: z.string().trim().max(100).nullable().optional(), defaultModel: z.string().trim().max(200).nullable().optional(),
  dataUsagePolicy: z.enum(["NO_TRAINING","TENANT_ONLY","STANDARD"]).default("NO_TRAINING"), humanApprovalRequired: z.boolean().default(true),
  monthlyTokenBudget: z.coerce.bigint().nonnegative().nullable().optional(), allowedUseCases: z.array(z.string().trim().min(2).max(100)).max(100).default([]), settings: jsonObject.optional(),
});

export const aiDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(2000).optional(),
});

export const createInvoiceSchema = z.object({
  number: z.string().trim().min(1).max(100),
  contractId: id.optional(),
  billToOrganizationId: id.optional(),
  currency,
  dueAt: optionalDate,
  lines: z.array(z.object({ description: z.string().trim().min(1).max(1000), quantity: z.number().int().positive().max(1_000_000).default(1), unitAmountMinor: minorAmount, taxRateBasisPoints: z.number().int().min(0).max(10_000).default(0), metadata: jsonObject.optional() })).min(1).max(500),
});

export const createChargeSchema = z.object({
  invoiceId: id,
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const searchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  scope: z.string().trim().min(1).max(50).default("all"),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const supportCaseSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(20_000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export const exportRequestSchema = z.object({
  type: z.enum(["ORGANIZATION", "PROJECT", "FINANCE", "AUDIT"]),
  filters: jsonObject.optional(),
});
