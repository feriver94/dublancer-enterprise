import { z } from "zod";

export const personaTypeSchema = z.enum(["CLIENT", "FREELANCER", "ORGANIZATION"]);

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const updateOnboardingSchema = z.object({
  identity: z.object({
    displayName: z.string().trim().min(2).max(120),
    legalFirstName: optionalText(100),
    legalLastName: optionalText(100),
    phoneCountryCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/).optional(),
    phoneNumber: z.string().trim().regex(/^\d{6,18}$/).optional(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
    timezone: z.string().trim().min(3).max(80),
    locale: z.enum(["en-AE", "ar-AE"]),
  }).optional(),
  selectedPersonaTypes: z.array(personaTypeSchema).min(1).max(3).optional(),
  client: z.object({
    displayName: z.string().trim().min(2).max(120),
    headline: optionalText(160),
    about: optionalText(3000),
  }).optional(),
  freelancer: z.object({
    headline: z.string().trim().min(3).max(160),
    bio: optionalText(5000),
    hourlyRateMinor: z.string().regex(/^\d{1,18}$/).optional(),
    yearsExperience: z.number().int().min(0).max(80).default(0),
    availability: z.enum(["AVAILABLE", "LIMITED", "UNAVAILABLE"]).default("AVAILABLE"),
  }).optional(),
  organization: z.object({
    organizationId: z.string().trim().min(1),
    legalName: z.string().trim().min(2).max(200),
    tradingName: optionalText(200),
    description: optionalText(5000),
    website: z.string().trim().url().max(500).optional().or(z.literal("")),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one onboarding section is required.",
});

export const activatePersonaSchema = z.object({
  personaId: z.string().trim().min(1),
});

export const switchPersonaSchema = activatePersonaSchema;

export const completeOnboardingSchema = z.object({
  preferredPersonaId: z.string().trim().min(1).optional(),
});
