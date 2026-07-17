import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  status: z.enum(["ACTIVE","SUSPENDED","ARCHIVED"]).optional(),
}).refine(v => Object.keys(v).length > 0);

export const settingsSchema = z.object({
  timezone: z.string().min(1).default("UTC"),
  defaultCurrency: z.string().length(3).transform(v => v.toUpperCase()).default("USD"),
  defaultLocale: z.string().min(2).default("en-AE"),
  locale: z.string().min(2).optional(),
  dataRegion: z.string().min(2).default("global"),
  requireMfa: z.boolean().default(false),
  allowGuestAccess: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).transform(({ locale, ...value }) => ({
  ...value,
  defaultLocale: locale ?? value.defaultLocale,
}));

export const inviteSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  roleId: z.string().min(1).optional(),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(168),
});

export const membershipSchema = z.object({
  roleId: z.string().min(1).nullable().optional(),
  status: z.enum(["INVITED","ACTIVE","SUSPENDED","REMOVED"]).optional(),
}).refine(v => Object.keys(v).length > 0);

export const invitationStatusSchema = z.object({
  status: z.enum(["ACCEPTED","EXPIRED","REVOKED"]),
});

export const activityQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});
