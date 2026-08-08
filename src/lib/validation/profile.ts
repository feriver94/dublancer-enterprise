import { z } from "zod";

export const profileVisibilitySchema = z.enum([
  "DRAFT",
  "HIDDEN",
  "PUBLIC",
  "VERIFIED",
  "SUSPENDED",
  "ARCHIVED",
]);

export const profileContentTypeSchema = z.enum([
  "PORTFOLIO",
  "CASE_STUDY",
  "PUBLICATION",
  "RESEARCH",
]);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const stringList = (maxItems = 20, maxLength = 120) => z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);
const httpUrl = z.string().trim().max(1000).refine((value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Use a valid HTTP or HTTPS URL.");
const optionalUrl = httpUrl.optional().nullable();

export const personalProfileSettingsSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9_-]{1,48}[a-z0-9])?$/),
  displayName: z.string().trim().min(2).max(120),
  preferredName: z.string().trim().min(2).max(120),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  timezone: z.string().trim().min(3).max(80),
  locale: z.enum(["en-AE", "ar-AE"]),
});

export const clientProfileSettingsSchema = z.object({
  version: z.number().int().positive(),
  displayName: z.string().trim().min(2).max(120),
  headline: optionalText(160),
  about: optionalText(5000),
  visibility: profileVisibilitySchema,
  bannerUrl: optionalUrl,
  avatarUrl: optionalUrl,
  industry: optionalText(120),
  companySize: optionalText(80),
  website: optionalUrl,
  languages: stringList(12, 50),
  responseTimeMinutes: z.number().int().min(0).max(525600).optional().nullable(),
  hiringAvailable: z.boolean(),
  showVerifiedSpend: z.boolean(),
  hiringPreferences: z.record(z.string(), z.unknown()).optional().nullable(),
  engagementModels: stringList(8, 50),
});

export const freelancerProfileSettingsSchema = z.object({
  version: z.number().int().positive(),
  headline: z.string().trim().min(3).max(160),
  bio: optionalText(5000),
  hourlyRateMinor: z.string().regex(/^\d{1,18}$/).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  availability: z.enum(["AVAILABLE", "LIMITED", "UNAVAILABLE"]),
  visibility: profileVisibilitySchema,
  bannerUrl: optionalUrl,
  avatarUrl: optionalUrl,
  languages: stringList(12, 50),
  industries: stringList(20, 100),
  services: stringList(30, 120),
  fixedPriceAvailable: z.boolean(),
  yearsExperience: z.number().int().min(0).max(80),
  resumeUrl: optionalUrl,
  videoUrl: optionalUrl,
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
});

export const organizationProfileSettingsSchema = z.object({
  organizationId: z.string().trim().min(1),
  version: z.number().int().positive(),
  legalName: z.string().trim().min(2).max(200),
  tradingName: optionalText(200),
  description: optionalText(5000),
  website: optionalUrl,
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  visibility: profileVisibilitySchema,
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,
  industry: optionalText(120),
  locations: z.array(z.object({ label: z.string().trim().min(1).max(160), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/) })).max(20),
  services: stringList(30, 120),
  technologies: stringList(50, 120),
  portfolio: z.array(z.object({ title: z.string().trim().min(2).max(160), description: optionalText(2000), url: optionalUrl })).max(50),
});

export const updateProfileSettingsSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("personal"), data: personalProfileSettingsSchema }),
  z.object({ section: z.literal("client"), data: clientProfileSettingsSchema }),
  z.object({ section: z.literal("freelancer"), data: freelancerProfileSettingsSchema }),
  z.object({ section: z.literal("organization"), data: organizationProfileSettingsSchema }),
]);

const contentBase = z.object({
  visibility: profileVisibilitySchema.default("PUBLIC"),
  version: z.number().int().positive().optional(),
});

export const portfolioContentSchema = contentBase.extend({
  title: z.string().trim().min(2).max(200),
  description: optionalText(5000),
  projectUrl: optionalUrl,
  mediaUrl: optionalUrl,
  completedAt: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const experienceContentSchema = contentBase.extend({
  companyName: z.string().trim().min(2).max(200),
  title: z.string().trim().min(2).max(200),
  description: optionalText(5000),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional().nullable(),
}).refine((value) => !value.endedAt || value.endedAt >= value.startedAt, { message: "End date must follow start date.", path: ["endedAt"] });

export const educationContentSchema = contentBase.extend({
  institution: z.string().trim().min(2).max(200),
  degree: z.string().trim().min(2).max(200),
  fieldOfStudy: optionalText(200),
  description: optionalText(3000),
  startedAt: z.coerce.date().optional().nullable(),
  endedAt: z.coerce.date().optional().nullable(),
}).refine((value) => !value.startedAt || !value.endedAt || value.endedAt >= value.startedAt, { message: "End date must follow start date.", path: ["endedAt"] });

export const certificationContentSchema = contentBase.extend({
  name: z.string().trim().min(2).max(200),
  issuer: z.string().trim().min(2).max(200),
  credentialId: optionalText(200),
  credentialUrl: optionalUrl,
  issuedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
}).refine((value) => !value.issuedAt || !value.expiresAt || value.expiresAt >= value.issuedAt, { message: "Expiry date must follow issue date.", path: ["expiresAt"] });

export const socialLinkContentSchema = contentBase.extend({
  personaType: z.enum(["CLIENT", "FREELANCER"]),
  platform: z.string().trim().toLowerCase().min(2).max(50),
  url: httpUrl.refine(Boolean, "URL is required."),
});

export const contentKindSchema = z.enum([
  "portfolio",
  "case-study",
  "publication",
  "research",
  "experience",
  "education",
  "certification",
  "social-link",
]);

export const reportProfileSchema = z.object({
  resourceType: z.enum(["CLIENT_PROFILE", "FREELANCER_PROFILE", "ORGANIZATION_PROFILE"]),
  resourceId: z.string().trim().min(1),
  category: z.string().trim().min(2).max(80),
  detail: z.string().trim().min(10).max(2000),
});

export const publicProfileParamsSchema = z.object({ username: z.string().trim().toLowerCase().min(3).max(64) });
export const publicOrganizationParamsSchema = z.object({ slug: z.string().trim().toLowerCase().min(2).max(120) });
