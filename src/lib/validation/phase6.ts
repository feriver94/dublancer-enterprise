import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const note = z.string().trim().min(3).max(5000);
const evidence = z.record(z.string(), z.unknown());

export const amendmentDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  note,
  expectedAmendmentVersion: z.number().int().positive(),
  expectedContractVersion: z.number().int().positive(),
});

export const disputeTransitionSchema = z.object({
  status: z.enum(["OPEN", "EVIDENCE_COLLECTION", "MEDIATION", "RESOLVED", "CLOSED", "CANCELLED"]),
  note,
  evidence: evidence.optional(),
  resolution: evidence.optional(),
  assignedToId: id.optional(),
  expectedVersion: z.number().int().positive(),
});

export const contractReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(160).optional(),
  body: z.string().trim().min(3).max(5000).optional(),
});

export const milestoneCloseoutSchema = z.object({
  note,
  expectedVersion: z.number().int().positive(),
});

export const contractCompletionSchema = z.object({
  note: z.string().trim().min(10).max(5000),
  checklist: z.record(z.string(), z.boolean()).refine((value) => Object.keys(value).length > 0),
  expectedVersion: z.number().int().positive(),
});

const optionalDate = z.coerce.date().optional();
const expectedVersion = z.number().int().positive();

export const phase6WorkspaceCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("timeEntry"), taskId: id.optional(), startedAt: z.coerce.date(), endedAt: optionalDate, durationMinutes: z.number().int().min(1).max(1440).optional(), description: z.string().trim().max(2000).optional(), billable: z.boolean().default(true) }),
  z.object({ type: z.literal("timesheet"), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }),
  z.object({ type: z.literal("deliverable"), taskId: id.optional(), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), dueAt: optionalDate, evidence: evidence.optional() }),
  z.object({ type: z.literal("dependency"), predecessorTaskId: id, successorTaskId: id, dependencyType: z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"]).default("FINISH_TO_START"), lagMinutes: z.number().int().min(-525600).max(525600).default(0) }),
  z.object({ type: z.literal("issue"), ownerId: id.optional(), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), dueAt: optionalDate }),
  z.object({ type: z.literal("risk"), ownerId: id.optional(), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), probability: z.number().int().min(0).max(100).default(50), impact: z.number().int().min(0).max(100).default(50), mitigation: z.string().trim().max(5000).optional(), dueAt: optionalDate }),
  z.object({ type: z.literal("changeRequest"), title: z.string().trim().min(3).max(200), description: z.string().trim().min(5).max(10000), impact: evidence.optional(), submit: z.boolean().default(true) }),
  z.object({ type: z.literal("resourceAllocation"), userId: id, allocationPercent: z.number().int().min(1).max(100), startsAt: z.coerce.date(), endsAt: optionalDate, roleLabel: z.string().trim().max(160).optional() }),
  z.object({ type: z.literal("template"), name: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), publish: z.boolean().default(false) }),
  z.object({ type: z.literal("health") }),
]);

export const phase6WorkspaceTransitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("timesheet"), id, action: z.enum(["SUBMIT", "APPROVE", "REJECT", "LOCK"]), note: z.string().trim().max(5000).optional(), expectedVersion }),
  z.object({ type: z.literal("deliverable"), id, action: z.enum(["SUBMIT", "START_REVIEW", "REQUEST_REVISION", "ACCEPT", "REJECT"]), note: z.string().trim().max(5000).optional(), evidence: evidence.optional(), expectedVersion }),
  z.object({ type: z.literal("issue"), id, status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED"]), resolution: z.string().trim().max(5000).optional(), expectedVersion }),
  z.object({ type: z.literal("risk"), id, status: z.enum(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"]), mitigation: z.string().trim().max(5000).optional(), expectedVersion }),
  z.object({ type: z.literal("changeRequest"), id, action: z.enum(["SUBMIT", "START_REVIEW", "APPROVE", "REJECT", "IMPLEMENT", "CANCEL"]), note: z.string().trim().max(5000).optional(), expectedVersion }),
  z.object({ type: z.literal("resourceAllocation"), id, allocationPercent: z.number().int().min(1).max(100).optional(), endsAt: z.coerce.date().nullable().optional(), roleLabel: z.string().trim().max(160).nullable().optional(), expectedVersion }),
  z.object({ type: z.literal("template"), id, action: z.enum(["PUBLISH", "ARCHIVE", "APPLY"]), expectedVersion }),
  z.object({ type: z.literal("completeProject") }),
]);
