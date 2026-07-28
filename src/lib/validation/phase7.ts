import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const name = z.string().trim().min(2).max(120);
const note = z.string().trim().min(3).max(2000);

export const subscriptionLifecycleSchema = z.object({
  action: z.enum([
    "START_TRIAL",
    "ACTIVATE",
    "CHANGE_PLAN",
    "SCHEDULE_RENEWAL",
    "RENEW",
    "SUSPEND",
    "REACTIVATE",
    "CANCEL_AT_PERIOD_END",
    "CANCEL",
  ]),
  expectedVersion: z.number().int().positive(),
  planId: id.optional(),
  periodEnd: z.coerce.date().optional(),
  trialDays: z.number().int().min(1).max(90).optional(),
  reason: z.string().trim().min(3).max(2000).optional(),
});

export const bulkInvitationsSchema = z.object({
  invitations: z.array(z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    roleId: id.optional(),
    expiresInHours: z.number().int().min(1).max(720).default(168),
  })).min(1).max(100),
});

export const bulkRoleChangeSchema = z.object({
  membershipIds: z.array(id).min(1).max(100),
  roleId: id,
});

const departmentCreate = z.object({
  action: z.literal("department.create"),
  name,
  description: z.string().trim().max(1000).optional(),
  parentId: id.optional(),
  managerMembershipId: id.optional(),
});
const departmentUpdate = z.object({
  action: z.literal("department.update"),
  id,
  name: name.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  parentId: id.nullable().optional(),
  managerMembershipId: id.nullable().optional(),
});
const departmentDelete = z.object({ action: z.literal("department.delete"), id });
const teamCreate = z.object({
  action: z.literal("team.create"),
  name,
  description: z.string().trim().max(1000).optional(),
  departmentId: id.optional(),
  managerMembershipId: id.optional(),
  membershipIds: z.array(id).max(500).optional(),
});
const teamUpdate = z.object({
  action: z.literal("team.update"),
  id,
  name: name.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  departmentId: id.nullable().optional(),
  managerMembershipId: id.nullable().optional(),
  membershipIds: z.array(id).max(500).optional(),
});
const teamDelete = z.object({ action: z.literal("team.delete"), id });
const permissionAudit = z.object({ action: z.literal("permissionAudit.run") });
const accessReviewCreate = z.object({
  action: z.literal("accessReview.create"),
  title: name,
  dueAt: z.coerce.date().optional(),
});
const accessReviewDecide = z.object({
  action: z.literal("accessReview.decide"),
  reviewId: id,
  itemId: id,
  decision: z.enum(["RETAIN", "CHANGE_ROLE", "SUSPEND", "REMOVE"]),
  proposedRoleId: id.optional(),
  note: z.string().trim().max(2000).optional(),
});
const accessReviewComplete = z.object({
  action: z.literal("accessReview.complete"),
  reviewId: id,
});

export const memberAdministrationSchema = z.discriminatedUnion("action", [
  departmentCreate,
  departmentUpdate,
  departmentDelete,
  teamCreate,
  teamUpdate,
  teamDelete,
  permissionAudit,
  accessReviewCreate,
  accessReviewDecide,
  accessReviewComplete,
]);

export const emailChangeSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

export const securityAdministrationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("VERIFY_DEVICE_TOKEN"), token: z.string().trim().min(32) }),
  z.object({ action: z.literal("RELEASE_LOCK"), id, note }),
  z.object({ action: z.enum(["VERIFY_DEVICE", "REVOKE_DEVICE", "REVIEW_DECISION"]), id, note }),
]);

export const emailProviderEventSchema = z.object({
  providerRef: z.string().trim().min(1).max(255),
  providerEventId: z.string().trim().min(1).max(255),
  event: z.enum(["DELIVERED", "SOFT_BOUNCE", "HARD_BOUNCE", "COMPLAINT"]),
  reason: z.string().trim().max(2000).optional(),
  occurredAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
