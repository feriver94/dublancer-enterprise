import { z } from "zod";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";

export const updateUserProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).nullable().optional(),
  email: z.string().trim().email().transform((v) => v.toLowerCase()).optional(),
}).refine((v) => Object.keys(v).length > 0);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  permissionKeys: z.array(z.enum(PLATFORM_PERMISSIONS)).default([]),
});

export const updateRoleSchema = createRoleSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
);

export const switchOrganizationSchema = z.object({
  organizationId: z.string().trim().min(1),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(32),
});

export const membershipActionSchema = z.object({
  action: z.enum(["SUSPEND", "RESTORE", "REMOVE"]),
});
