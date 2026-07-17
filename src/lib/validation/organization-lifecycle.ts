import { z } from "zod";

export const inviteOrganizationMemberSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  roleId: z.string().min(1).optional(),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(168),
});

export const acceptOrganizationInvitationSchema = z.object({
  token: z.string().min(32),
});

export const transferOwnershipSchema = z.object({
  targetMembershipId: z.string().min(1),
});

export const memberLifecycleSchema = z.object({
  action: z.enum(["SUSPEND", "RESTORE", "REMOVE"]),
});

export const assignRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const createCustomRoleSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  permissionKeys: z.array(z.string().min(1)).max(100).default([]),
});
