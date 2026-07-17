import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import type { WorkflowGraph } from "@/lib/validation/orchestration";
import { ALLOWED_WORKFLOW_STEP_TYPES } from "@/lib/validation/orchestration";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function emit(tx: Prisma.TransactionClient, context: TenantContext, eventType: string, aggregateType: string, aggregateId: string, payload: unknown) {
  await tx.realtimeEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, topic: `organization:${context.organizationId}`, eventType, aggregateType, aggregateId, payload: json(payload) } });
}

export class EnterpriseOrchestrationService {
  async overview(context: TenantContext) {
    await requirePermission(context, "orchestration.read");
    const [definitions, runs, approvals, graphNodes, matches] = await Promise.all([
      prisma.workflowDefinition.count({ where: { organizationId: context.organizationId } }),
      prisma.workflowRun.groupBy({ by: ["status"], where: { organizationId: context.organizationId }, _count: true }),
      prisma.workflowApproval.count({ where: { organizationId: context.organizationId, decision: "PENDING" } }),
      prisma.workGraphNode.count({ where: { organizationId: context.organizationId, isActive: true } }),
      prisma.talentMatch.count({ where: { organizationId: context.organizationId } }),
    ]);
    return { definitions, runs: Object.fromEntries(runs.map((row) => [row.status, row._count])), pendingApprovals: approvals, graphNodes, talentMatches: matches };
  }

  async listDefinitions(context: TenantContext) {
    await requirePermission(context, "orchestration.read");
    return prisma.workflowDefinition.findMany({ where: { organizationId: context.organizationId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, _count: { select: { runs: true } } }, orderBy: { updatedAt: "desc" } });
  }

  async listRuns(context: TenantContext) {
    await requirePermission(context, "orchestration.read");
    return prisma.workflowRun.findMany({ where: { organizationId: context.organizationId }, include: { definition: { select: { id: true, key: true, name: true } }, steps: true, approvals: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async createDefinition(context: TenantContext, input: { key: string; name: string; description?: string; concurrencyLimit: number; timeoutSeconds: number; publish: boolean; graph: WorkflowGraph }) {
    await requirePermission(context, "orchestration.manage");
    const graphChecksum = checksum(input.graph);
    return prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.create({ data: { organizationId: context.organizationId, createdById: context.userId, key: input.key, name: input.name, description: input.description, concurrencyLimit: input.concurrencyLimit, timeoutSeconds: input.timeoutSeconds, status: input.publish ? "PUBLISHED" : "DRAFT", activeVersion: input.publish ? 1 : null, versions: { create: { version: 1, checksum: graphChecksum, graph: json(input.graph), publishedAt: input.publish ? new Date() : null } } }, include: { versions: true } });
      await emit(tx, context, "workflow.definition.created", "WorkflowDefinition", definition.id, { key: definition.key, version: 1, checksum: graphChecksum });
      return definition;
    });
  }

  async publish(context: TenantContext, definitionId: string) {
    await requirePermission(context, "orchestration.manage");
    const definition = await prisma.workflowDefinition.findFirst({ where: { id: definitionId, organizationId: context.organizationId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!definition?.versions[0]) throw new AppError("NOT_FOUND", "Workflow definition not found.", 404);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.workflowDefinition.update({ where: { id: definition.id }, data: { status: "PUBLISHED", activeVersion: definition.versions[0].version } });
      await tx.workflowVersion.update({ where: { id: definition.versions[0].id }, data: { publishedAt: new Date() } });
      await emit(tx, context, "workflow.definition.published", "WorkflowDefinition", updated.id, { version: updated.activeVersion });
      return updated;
    });
  }

  async start(context: TenantContext, input: { definitionId: string; idempotencyKey: string; input: Record<string, unknown> }) {
    await requirePermission(context, "orchestration.run");
    const existing = await prisma.workflowRun.findUnique({ where: { organizationId_definitionId_idempotencyKey: { organizationId: context.organizationId, definitionId: input.definitionId, idempotencyKey: input.idempotencyKey } }, include: { steps: true } });
    if (existing) return existing;
    const fallback = await prisma.workflowDefinition.findFirst({ where: { id: input.definitionId, organizationId: context.organizationId, status: "PUBLISHED" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!fallback?.versions[0]) throw new AppError("NOT_FOUND", "Published workflow definition not found.", 404);
    const running = await prisma.workflowRun.count({ where: { definitionId: fallback.id, status: { in: ["QUEUED", "RUNNING", "WAITING_APPROVAL"] } } });
    if (running >= fallback.concurrencyLimit) throw new AppError("CONFLICT", "Workflow concurrency limit reached.", 409);
    const graph = fallback.versions[0].graph as unknown as WorkflowGraph;
    return prisma.$transaction(async (tx) => {
      const run = await tx.workflowRun.create({ data: { organizationId: context.organizationId, definitionId: fallback.id, versionId: fallback.versions[0].id, startedById: context.userId, idempotencyKey: input.idempotencyKey, correlationId: randomUUID(), input: json(input.input), timeoutAt: new Date(Date.now() + fallback.timeoutSeconds * 1000), steps: { create: graph.nodes.map((node) => ({ stepKey: node.key, stepType: node.type, maxAttempts: node.maxAttempts, config: json(node.config) })) } }, include: { steps: true } });
      await emit(tx, context, "workflow.run.queued", "WorkflowRun", run.id, { definitionId: fallback.id, correlationId: run.correlationId });
      return run;
    });
  }

  async decide(context: TenantContext, runId: string, input: { decision: "APPROVED" | "REJECTED"; comment?: string }) {
    await requirePermission(context, "orchestration.approve");
    const approval = await prisma.workflowApproval.findFirst({ where: { runId, organizationId: context.organizationId, decision: "PENDING" } });
    if (!approval) throw new AppError("NOT_FOUND", "Pending workflow approval not found.", 404);
    return prisma.$transaction(async (tx) => {
      const decided = await tx.workflowApproval.update({ where: { id: approval.id }, data: { decision: input.decision, comment: input.comment, decidedById: context.userId, decidedAt: new Date() } });
      await tx.workflowStepRun.update({ where: { id: approval.stepRunId }, data: { status: input.decision === "APPROVED" ? "COMPLETED" : "FAILED", finishedAt: new Date(), output: json({ decision: input.decision }) } });
      await tx.workflowRun.update({ where: { id: runId }, data: input.decision === "APPROVED" ? { status: "QUEUED", availableAt: new Date() } : { status: "FAILED", finishedAt: new Date(), error: json({ code: "APPROVAL_REJECTED" }) } });
      await emit(tx, context, "workflow.approval.decided", "WorkflowApproval", decided.id, { decision: input.decision, runId });
      return decided;
    });
  }

  async processNext(workerId: string) {
    const step = await prisma.workflowStepRun.findFirst({ where: { status: "PENDING", availableAt: { lte: new Date() }, run: { status: { in: ["QUEUED", "RUNNING"] } } }, include: { run: { include: { version: true } } }, orderBy: { createdAt: "asc" } });
    if (!step) return { processed: false };
    if (!(ALLOWED_WORKFLOW_STEP_TYPES as readonly string[]).includes(step.stepType)) throw new AppError("CONFLICT", "Workflow step type is not allowlisted.", 409);
    const claimed = await prisma.workflowStepRun.updateMany({ where: { id: step.id, status: "PENDING", lockedAt: null }, data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempt: { increment: 1 }, startedAt: new Date() } });
    if (!claimed.count) return { processed: false };
    const context = { organizationId: step.run.organizationId, userId: step.run.startedById, isPlatformAdmin: false };
    if (step.stepType === "HUMAN_APPROVAL") {
      await prisma.$transaction(async (tx) => {
        await tx.workflowStepRun.update({ where: { id: step.id }, data: { status: "WAITING_APPROVAL" } });
        await tx.workflowRun.update({ where: { id: step.runId }, data: { status: "WAITING_APPROVAL" } });
        await tx.workflowApproval.create({ data: { organizationId: step.run.organizationId, runId: step.runId, stepRunId: step.id, requestedById: step.run.startedById, reason: "Governed workflow requires human approval." } });
        await emit(tx, context, "workflow.approval.requested", "WorkflowStepRun", step.id, { runId: step.runId });
      });
      return { processed: true, waitingApproval: true, stepId: step.id };
    }
    await prisma.$transaction(async (tx) => {
      await tx.workflowStepRun.update({ where: { id: step.id }, data: { status: "COMPLETED", finishedAt: new Date(), output: json({ executedBy: workerId, stepType: step.stepType }) } });
      const remaining = await tx.workflowStepRun.count({ where: { runId: step.runId, status: { in: ["PENDING", "RUNNING", "WAITING_APPROVAL"] }, id: { not: step.id } } });
      await tx.workflowRun.update({ where: { id: step.runId }, data: remaining ? { status: "RUNNING", startedAt: step.run.startedAt ?? new Date() } : { status: "COMPLETED", finishedAt: new Date(), output: json({ completed: true }) } });
      await emit(tx, context, "workflow.step.completed", "WorkflowStepRun", step.id, { runId: step.runId, stepType: step.stepType });
    });
    return { processed: true, stepId: step.id };
  }
}

export class WorkGraphService {
  async snapshot(context: TenantContext) {
    await requirePermission(context, "workgraph.read");
    const [nodes, edges] = await Promise.all([prisma.workGraphNode.findMany({ where: { organizationId: context.organizationId, isActive: true }, orderBy: { updatedAt: "desc" }, take: 500 }), prisma.workGraphEdge.findMany({ where: { organizationId: context.organizationId }, take: 1000 })]);
    return { nodes, edges };
  }
  async rebuild(context: TenantContext) {
    await requirePermission(context, "workgraph.manage");
    const [organization, projects, listings] = await Promise.all([prisma.organization.findUnique({ where: { id: context.organizationId }, select: { id: true, name: true } }), prisma.project.findMany({ where: { organizationId: context.organizationId }, select: { id: true, title: true } }), prisma.marketplaceListing.findMany({ where: { organizationId: context.organizationId }, select: { id: true, title: true } })]);
    if (!organization) throw new AppError("NOT_FOUND", "Organization not found.", 404);
    return prisma.$transaction(async (tx) => {
      await tx.workGraphEdge.deleteMany({ where: { organizationId: context.organizationId } });
      await tx.workGraphNode.deleteMany({ where: { organizationId: context.organizationId } });
      const root = await tx.workGraphNode.create({ data: { organizationId: context.organizationId, type: "ORGANIZATION", externalId: organization.id, label: organization.name, fingerprint: checksum(["ORGANIZATION", organization.id]) } });
      for (const project of projects) { const node = await tx.workGraphNode.create({ data: { organizationId: context.organizationId, projectId: project.id, type: "PROJECT", externalId: project.id, label: project.title, fingerprint: checksum(["PROJECT", project.id]) } }); await tx.workGraphEdge.create({ data: { organizationId: context.organizationId, fromNodeId: root.id, toNodeId: node.id, type: "OWNS" } }); }
      for (const listing of listings) { const node = await tx.workGraphNode.create({ data: { organizationId: context.organizationId, type: "LISTING", externalId: listing.id, label: listing.title, fingerprint: checksum(["LISTING", listing.id]) } }); await tx.workGraphEdge.create({ data: { organizationId: context.organizationId, fromNodeId: root.id, toNodeId: node.id, type: "OWNS" } }); }
      await emit(tx, context, "workgraph.rebuilt", "Organization", context.organizationId, { projects: projects.length, listings: listings.length });
      return { nodes: projects.length + listings.length + 1, edges: projects.length + listings.length };
    });
  }
}

export class TalentMatchingService {
  async generate(context: TenantContext, listingId: string, limit: number) {
    await requirePermission(context, "matching.manage");
    const listing = await prisma.marketplaceListing.findFirst({ where: { id: listingId, organizationId: context.organizationId }, include: { skills: true } });
    if (!listing) throw new AppError("NOT_FOUND", "Marketplace listing not found.", 404);
    const required = new Set(listing.skills.map((entry) => entry.skillId));
    const profiles = await prisma.freelancerProfile.findMany({ where: { isPublic: true }, include: { skills: true }, take: Math.min(500, limit * 10) });
    const ranked = profiles.map((profile) => {
      const profileSkills = new Set(profile.skills.map((entry) => entry.skillId));
      const matched = [...required].filter((skillId) => profileSkills.has(skillId)).length;
      const skillScore = required.size ? Math.round(matched / required.size * 100) : 100;
      const experienceScore = Math.min(100, profile.yearsExperience * 10);
      const availabilityScore = profile.availability === "AVAILABLE" ? 100 : profile.availability === "LIMITED" ? 60 : 0;
      const score = Math.round(skillScore * 0.65 + experienceScore * 0.25 + availabilityScore * 0.10);
      return { profile, score, skillScore, experienceScore, availabilityScore, matched };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
    for (const match of ranked) await prisma.talentMatch.upsert({ where: { organizationId_listingId_freelancerProfileId: { organizationId: context.organizationId, listingId, freelancerProfileId: match.profile.id } }, create: { organizationId: context.organizationId, listingId, freelancerProfileId: match.profile.id, score: match.score, skillScore: match.skillScore, experienceScore: match.experienceScore, availabilityScore: match.availabilityScore, explanation: json({ formula: "skills 65%, experience 25%, availability 10%", matchedSkills: match.matched, protectedAttributesUsed: false }) }, update: { score: match.score, skillScore: match.skillScore, experienceScore: match.experienceScore, availabilityScore: match.availabilityScore, explanation: json({ formula: "skills 65%, experience 25%, availability 10%", matchedSkills: match.matched, protectedAttributesUsed: false }) } });
    return prisma.talentMatch.findMany({ where: { organizationId: context.organizationId, listingId }, include: { freelancerProfile: { include: { user: { select: { id: true, displayName: true } }, skills: { include: { skill: true } } } } }, orderBy: { score: "desc" }, take: limit });
  }
}
