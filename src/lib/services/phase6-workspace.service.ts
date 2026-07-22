import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { phase6WorkspaceCreateSchema, phase6WorkspaceTransitionSchema } from "@/lib/validation/phase6";

type CreateInput = z.infer<typeof phase6WorkspaceCreateSchema>;
type TransitionInput = z.infer<typeof phase6WorkspaceTransitionSchema>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class Phase6WorkspaceService {
  async summary(context: TenantContext, projectId: string) {
    await requirePermission(context, "workspace.delivery.manage");
    const access = await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"]);
    const [timeEntries, timesheets, deliverables, dependencies, issues, risks, changes, allocations, templates, latestHealth] = await Promise.all([
      prisma.timeEntry.findMany({ where: { projectId }, include: { user: { select: { id: true, displayName: true } }, task: { select: { id: true, title: true } } }, orderBy: { startedAt: "desc" }, take: 200 }),
      prisma.timesheet.findMany({ where: { projectId }, include: { user: { select: { id: true, displayName: true } }, approvedBy: { select: { id: true, displayName: true } }, entries: { orderBy: { startedAt: "asc" } } }, orderBy: { periodStart: "desc" }, take: 100 }),
      prisma.deliverable.findMany({ where: { projectId }, include: { createdBy: { select: { id: true, displayName: true } }, decidedBy: { select: { id: true, displayName: true } }, task: { select: { id: true, title: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.taskDependency.findMany({ where: { projectId }, include: { predecessorTask: { select: { id: true, title: true } }, successorTask: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.projectIssue.findMany({ where: { projectId }, include: { owner: { select: { id: true, displayName: true } } }, orderBy: [{ status: "asc" }, { severity: "desc" }, { updatedAt: "desc" }], take: 200 }),
      prisma.projectRisk.findMany({ where: { projectId }, include: { owner: { select: { id: true, displayName: true } } }, orderBy: [{ status: "asc" }, { severity: "desc" }, { updatedAt: "desc" }], take: 200 }),
      prisma.changeRequest.findMany({ where: { projectId }, include: { requestedBy: { select: { id: true, displayName: true } }, decidedBy: { select: { id: true, displayName: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.resourceAllocation.findMany({ where: { projectId }, include: { user: { select: { id: true, displayName: true } }, allocatedBy: { select: { id: true, displayName: true } } }, orderBy: { startsAt: "desc" }, take: 200 }),
      prisma.projectTemplate.findMany({ where: { organizationId: access.project.organizationId }, include: { createdBy: { select: { id: true, displayName: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.projectHealthSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    ]);
    const health = await this.calculateHealth(projectId);
    return { role: access.role, timeEntries, timesheets, deliverables, dependencies, issues, risks, changeRequests: changes, resourceAllocations: allocations, templates, health: { current: health, latestSnapshot: latestHealth } };
  }

  async create(context: TenantContext, projectId: string, input: CreateInput) {
    await requirePermission(context, "workspace.delivery.manage");
    const roles = input.type === "timeEntry" || input.type === "timesheet" || input.type === "deliverable" || input.type === "changeRequest" ? ["OWNER", "MANAGER", "CONTRIBUTOR"] as const : ["OWNER", "MANAGER"] as const;
    const access = await requireProjectAccess(context, projectId, [...roles]);
    switch (input.type) {
      case "timeEntry": return this.createTimeEntry(context, projectId, input);
      case "timesheet": return this.createTimesheet(context, projectId, input);
      case "deliverable": return this.createDeliverable(context, projectId, input);
      case "dependency": return this.createDependency(context, projectId, input);
      case "issue": return this.createIssue(context, projectId, input);
      case "risk": return this.createRisk(context, projectId, input);
      case "changeRequest": return this.createChangeRequest(context, projectId, input);
      case "resourceAllocation": return this.createAllocation(context, projectId, access.project.organizationId, input);
      case "template": return this.createTemplate(context, projectId, access.project.organizationId, input);
      case "health": return this.snapshotHealth(context, projectId);
    }
  }

  async transition(context: TenantContext, projectId: string, input: TransitionInput) {
    await requirePermission(context, "workspace.delivery.manage");
    const access = await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR"]);
    switch (input.type) {
      case "timesheet": return this.transitionTimesheet(context, projectId, access.role, input);
      case "deliverable": return this.transitionDeliverable(context, projectId, access.role, input);
      case "issue": return this.transitionIssue(context, projectId, input);
      case "risk": return this.transitionRisk(context, projectId, input);
      case "changeRequest": return this.transitionChangeRequest(context, projectId, access.role, input);
      case "resourceAllocation": return this.updateAllocation(context, projectId, access.project.organizationId, input);
      case "template": return this.transitionTemplate(context, projectId, access.project.organizationId, input);
      case "completeProject": return this.completeProject(context, projectId, access.role);
    }
  }

  private async createTimeEntry(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "timeEntry" }>) {
    if (input.taskId && !(await prisma.projectTask.findFirst({ where: { id: input.taskId, projectId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Task not found in this project.", 404);
    if (input.endedAt && input.endedAt <= input.startedAt) throw new AppError("VALIDATION_ERROR", "End time must be after start time.", 422);
    const durationMinutes = input.durationMinutes ?? (input.endedAt ? Math.ceil((input.endedAt.getTime() - input.startedAt.getTime()) / 60000) : null);
    if (!durationMinutes) throw new AppError("VALIDATION_ERROR", "A duration or end time is required.", 422);
    const overlap = await prisma.timeEntry.findFirst({ where: { projectId, userId: context.userId, startedAt: { lt: input.endedAt ?? new Date(input.startedAt.getTime() + durationMinutes * 60000) }, OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }] }, select: { id: true } });
    if (overlap) throw new AppError("CONFLICT", "This time entry overlaps another project entry.", 409);
    return prisma.$transaction(async (tx) => {
      const row = await tx.timeEntry.create({ data: { projectId, taskId: input.taskId, userId: context.userId, startedAt: input.startedAt, endedAt: input.endedAt ?? new Date(input.startedAt.getTime() + durationMinutes * 60000), durationMinutes, description: input.description, billable: input.billable } });
      await this.activity(tx, context, projectId, "TimeEntry", row.id, "Time entry recorded.", { durationMinutes });
      return row;
    });
  }

  private async createTimesheet(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "timesheet" }>) {
    if (input.periodEnd <= input.periodStart) throw new AppError("VALIDATION_ERROR", "Timesheet period end must follow its start.", 422);
    const overlap = await prisma.timesheet.findFirst({ where: { projectId, userId: context.userId, periodStart: { lt: input.periodEnd }, periodEnd: { gt: input.periodStart } }, select: { id: true } });
    if (overlap) throw new AppError("CONFLICT", "A timesheet already overlaps this period.", 409);
    return prisma.$transaction(async (tx) => {
      const entries = await tx.timeEntry.findMany({ where: { projectId, userId: context.userId, timesheetId: null, startedAt: { gte: input.periodStart, lt: input.periodEnd }, endedAt: { not: null } } });
      const totalMinutes = entries.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0);
      const sheet = await tx.timesheet.create({ data: { projectId, userId: context.userId, periodStart: input.periodStart, periodEnd: input.periodEnd, totalMinutes } });
      if (entries.length) await tx.timeEntry.updateMany({ where: { id: { in: entries.map((entry) => entry.id) }, timesheetId: null }, data: { timesheetId: sheet.id, version: { increment: 1 } } });
      await this.activity(tx, context, projectId, "Timesheet", sheet.id, "Timesheet created.", { entryCount: entries.length, totalMinutes });
      return tx.timesheet.findUniqueOrThrow({ where: { id: sheet.id }, include: { entries: true } });
    }, { isolationLevel: "Serializable" });
  }

  private async transitionTimesheet(context: TenantContext, projectId: string, role: string, input: Extract<TransitionInput, { type: "timesheet" }>) {
    const sheet = await prisma.timesheet.findFirst({ where: { id: input.id, projectId }, include: { entries: true } });
    if (!sheet) throw new AppError("NOT_FOUND", "Timesheet not found.", 404);
    const owns = sheet.userId === context.userId;
    const manages = role === "OWNER" || role === "MANAGER";
    let status: "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED";
    const data: Prisma.TimesheetUpdateManyMutationInput = { version: { increment: 1 } };
    if (input.action === "SUBMIT") {
      if (!owns || !["DRAFT", "REJECTED"].includes(sheet.status)) throw new AppError("FORBIDDEN", "Only the timesheet owner can submit a draft or rejected timesheet.", 403);
      if (!sheet.entries.length || sheet.entries.some((entry) => !entry.endedAt || !entry.durationMinutes)) throw new AppError("CONFLICT", "A timesheet requires at least one completed time entry.", 409);
      status = "SUBMITTED"; Object.assign(data, { status, submittedAt: new Date(), approvedAt: null, approvedById: null, decisionNote: null, totalMinutes: sheet.entries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0) });
    } else if (input.action === "APPROVE") {
      if (!manages || owns || sheet.status !== "SUBMITTED") throw new AppError("FORBIDDEN", "A project manager other than the owner must approve the submitted timesheet.", 403);
      status = "APPROVED"; Object.assign(data, { status, approvedAt: new Date(), approvedById: context.userId, decisionNote: input.note });
    } else if (input.action === "REJECT") {
      if (!manages || owns || sheet.status !== "SUBMITTED" || !input.note) throw new AppError("FORBIDDEN", "A manager and rejection note are required.", 403);
      status = "REJECTED"; Object.assign(data, { status, approvedAt: null, approvedById: context.userId, decisionNote: input.note });
    } else {
      if (!manages || sheet.status !== "APPROVED") throw new AppError("CONFLICT", "Only an approved timesheet can be locked.", 409);
      status = "LOCKED"; Object.assign(data, { status, lockedAt: new Date() });
    }
    return prisma.$transaction(async (tx) => {
      const changed = await tx.timesheet.updateMany({ where: { id: sheet.id, projectId, status: sheet.status, version: input.expectedVersion }, data });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The timesheet changed before the decision.", 409);
      await this.activity(tx, context, projectId, "Timesheet", sheet.id, `Timesheet ${status.toLowerCase()}.`, { previousStatus: sheet.status, status });
      return tx.timesheet.findUniqueOrThrow({ where: { id: sheet.id }, include: { entries: true, approvedBy: { select: { id: true, displayName: true } } } });
    });
  }

  private async createDeliverable(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "deliverable" }>) {
    if (input.taskId && !(await prisma.projectTask.findFirst({ where: { id: input.taskId, projectId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Task not found in this project.", 404);
    return prisma.deliverable.create({ data: { projectId, taskId: input.taskId, createdById: context.userId, title: input.title, description: input.description, dueAt: input.dueAt, evidence: input.evidence ? json(input.evidence) : undefined } });
  }

  private async transitionDeliverable(context: TenantContext, projectId: string, role: string, input: Extract<TransitionInput, { type: "deliverable" }>) {
    const item = await prisma.deliverable.findFirst({ where: { id: input.id, projectId } });
    if (!item) throw new AppError("NOT_FOUND", "Deliverable not found.", 404);
    const manages = role === "OWNER" || role === "MANAGER";
    const owns = item.createdById === context.userId;
    const transitions: Record<string, Record<string, string>> = { DRAFT: { SUBMIT: "SUBMITTED" }, SUBMITTED: { START_REVIEW: "IN_REVIEW", REQUEST_REVISION: "REVISION_REQUESTED", ACCEPT: "ACCEPTED", REJECT: "REJECTED" }, IN_REVIEW: { REQUEST_REVISION: "REVISION_REQUESTED", ACCEPT: "ACCEPTED", REJECT: "REJECTED" }, REVISION_REQUESTED: { SUBMIT: "SUBMITTED" } };
    const status = transitions[item.status]?.[input.action] as "SUBMITTED" | "IN_REVIEW" | "REVISION_REQUESTED" | "ACCEPTED" | "REJECTED" | undefined;
    if (!status) throw new AppError("CONFLICT", "Invalid deliverable transition.", 409);
    if (["SUBMIT"].includes(input.action) ? !(owns || manages) : !manages) throw new AppError("FORBIDDEN", "This deliverable action requires project manager access.", 403);
    if (["REQUEST_REVISION", "REJECT"].includes(input.action) && !input.note) throw new AppError("VALIDATION_ERROR", "A decision note is required.", 422);
    const changed = await prisma.deliverable.updateMany({ where: { id: item.id, projectId, status: item.status, version: input.expectedVersion }, data: { status, submittedAt: status === "SUBMITTED" ? new Date() : undefined, acceptedAt: status === "ACCEPTED" ? new Date() : null, decidedById: manages && !["SUBMITTED"].includes(status) ? context.userId : undefined, decisionNote: input.note, evidence: input.evidence ? json(input.evidence) : undefined, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The deliverable changed before the transition.", 409);
    return prisma.deliverable.findUniqueOrThrow({ where: { id: item.id } });
  }

  private async createDependency(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "dependency" }>) {
    if (input.predecessorTaskId === input.successorTaskId) throw new AppError("VALIDATION_ERROR", "A task cannot depend on itself.", 422);
    const tasks = await prisma.projectTask.findMany({ where: { projectId, id: { in: [input.predecessorTaskId, input.successorTaskId] } }, select: { id: true } });
    if (tasks.length !== 2) throw new AppError("NOT_FOUND", "Both dependency tasks must belong to this project.", 404);
    const links = await prisma.taskDependency.findMany({ where: { projectId }, select: { predecessorTaskId: true, successorTaskId: true } });
    const adjacency = new Map<string, string[]>();
    for (const link of links) adjacency.set(link.predecessorTaskId, [...(adjacency.get(link.predecessorTaskId) ?? []), link.successorTaskId]);
    adjacency.set(input.predecessorTaskId, [...(adjacency.get(input.predecessorTaskId) ?? []), input.successorTaskId]);
    const visit = (taskId: string, seen = new Set<string>()): boolean => taskId === input.predecessorTaskId && seen.size > 0 ? true : seen.has(taskId) ? false : (seen.add(taskId), (adjacency.get(taskId) ?? []).some((next) => visit(next, new Set(seen))));
    if (visit(input.successorTaskId)) throw new AppError("CONFLICT", "The dependency would create a task cycle.", 409);
    return prisma.taskDependency.create({ data: { projectId, predecessorTaskId: input.predecessorTaskId, successorTaskId: input.successorTaskId, dependencyType: input.dependencyType, lagMinutes: input.lagMinutes } });
  }

  private createIssue(_context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "issue" }>) {
    return prisma.projectIssue.create({ data: { projectId, ownerId: input.ownerId, title: input.title, description: input.description, severity: input.severity, dueAt: input.dueAt } });
  }

  private async transitionIssue(_context: TenantContext, projectId: string, input: Extract<TransitionInput, { type: "issue" }>) {
    const item = await prisma.projectIssue.findFirst({ where: { id: input.id, projectId } });
    if (!item) throw new AppError("NOT_FOUND", "Project issue not found.", 404);
    const allowed: Record<string, string[]> = { OPEN: ["IN_PROGRESS", "BLOCKED", "RESOLVED"], IN_PROGRESS: ["BLOCKED", "RESOLVED"], BLOCKED: ["IN_PROGRESS", "RESOLVED"], RESOLVED: ["CLOSED", "IN_PROGRESS"], CLOSED: [] };
    if (!allowed[item.status].includes(input.status) || (["RESOLVED", "CLOSED"].includes(input.status) && !input.resolution)) throw new AppError("CONFLICT", "Invalid issue transition or missing resolution.", 409);
    const changed = await prisma.projectIssue.updateMany({ where: { id: item.id, projectId, status: item.status, version: input.expectedVersion }, data: { status: input.status, resolution: input.resolution, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The issue changed before the transition.", 409);
    return prisma.projectIssue.findUniqueOrThrow({ where: { id: item.id } });
  }

  private createRisk(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "risk" }>) {
    return prisma.projectRisk.create({ data: { projectId, ownerId: input.ownerId ?? context.userId, title: input.title, description: input.description, severity: input.severity, probability: input.probability, impact: input.impact, mitigation: input.mitigation, dueAt: input.dueAt } });
  }

  private async transitionRisk(_context: TenantContext, projectId: string, input: Extract<TransitionInput, { type: "risk" }>) {
    const item = await prisma.projectRisk.findFirst({ where: { id: input.id, projectId } });
    if (!item) throw new AppError("NOT_FOUND", "Project risk not found.", 404);
    const allowed: Record<string, string[]> = { OPEN: ["MITIGATING", "ACCEPTED", "CLOSED"], MITIGATING: ["OPEN", "ACCEPTED", "CLOSED"], ACCEPTED: ["MITIGATING", "CLOSED"], CLOSED: [] };
    if (!allowed[item.status].includes(input.status)) throw new AppError("CONFLICT", "Invalid risk transition.", 409);
    const changed = await prisma.projectRisk.updateMany({ where: { id: item.id, projectId, status: item.status, version: input.expectedVersion }, data: { status: input.status, mitigation: input.mitigation, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The risk changed before the transition.", 409);
    return prisma.projectRisk.findUniqueOrThrow({ where: { id: item.id } });
  }

  private createChangeRequest(context: TenantContext, projectId: string, input: Extract<CreateInput, { type: "changeRequest" }>) {
    return prisma.changeRequest.create({ data: { projectId, requestedById: context.userId, title: input.title, description: input.description, impact: input.impact ? json(input.impact) : undefined, status: input.submit ? "SUBMITTED" : "DRAFT" } });
  }

  private async transitionChangeRequest(context: TenantContext, projectId: string, role: string, input: Extract<TransitionInput, { type: "changeRequest" }>) {
    const item = await prisma.changeRequest.findFirst({ where: { id: input.id, projectId } });
    if (!item) throw new AppError("NOT_FOUND", "Change request not found.", 404);
    const manages = role === "OWNER" || role === "MANAGER";
    const owns = item.requestedById === context.userId;
    const map: Record<string, Record<string, string>> = { DRAFT: { SUBMIT: "SUBMITTED", CANCEL: "CANCELLED" }, SUBMITTED: { START_REVIEW: "UNDER_REVIEW", APPROVE: "APPROVED", REJECT: "REJECTED", CANCEL: "CANCELLED" }, UNDER_REVIEW: { APPROVE: "APPROVED", REJECT: "REJECTED", CANCEL: "CANCELLED" }, APPROVED: { IMPLEMENT: "IMPLEMENTED", CANCEL: "CANCELLED" } };
    const status = map[item.status]?.[input.action] as "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "IMPLEMENTED" | "CANCELLED" | undefined;
    if (!status) throw new AppError("CONFLICT", "Invalid change-request transition.", 409);
    if (["SUBMIT", "CANCEL"].includes(input.action) ? !(owns || manages) : !manages) throw new AppError("FORBIDDEN", "This change-request action requires manager access.", 403);
    if (["APPROVE", "REJECT"].includes(input.action) && !input.note) throw new AppError("VALIDATION_ERROR", "A decision note is required.", 422);
    const changed = await prisma.changeRequest.updateMany({ where: { id: item.id, projectId, status: item.status, version: input.expectedVersion }, data: { status, decidedById: ["APPROVED", "REJECTED"].includes(status) ? context.userId : undefined, decidedAt: ["APPROVED", "REJECTED"].includes(status) ? new Date() : undefined, decisionNote: input.note, implementedAt: status === "IMPLEMENTED" ? new Date() : undefined, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The change request changed before the transition.", 409);
    return prisma.changeRequest.findUniqueOrThrow({ where: { id: item.id } });
  }

  private async createAllocation(context: TenantContext, projectId: string, organizationId: string, input: Extract<CreateInput, { type: "resourceAllocation" }>) {
    await this.assertAllocation(projectId, organizationId, input.userId, input.allocationPercent, input.startsAt, input.endsAt);
    return prisma.resourceAllocation.create({ data: { projectId, userId: input.userId, allocatedById: context.userId, allocationPercent: input.allocationPercent, startsAt: input.startsAt, endsAt: input.endsAt, roleLabel: input.roleLabel } });
  }

  private async updateAllocation(_context: TenantContext, projectId: string, organizationId: string, input: Extract<TransitionInput, { type: "resourceAllocation" }>) {
    const item = await prisma.resourceAllocation.findFirst({ where: { id: input.id, projectId } });
    if (!item) throw new AppError("NOT_FOUND", "Resource allocation not found.", 404);
    const percent = input.allocationPercent ?? item.allocationPercent;
    const endsAt = input.endsAt === undefined ? item.endsAt : input.endsAt;
    await this.assertAllocation(projectId, organizationId, item.userId, percent, item.startsAt, endsAt ?? undefined, item.id);
    const changed = await prisma.resourceAllocation.updateMany({ where: { id: item.id, projectId, version: input.expectedVersion }, data: { allocationPercent: input.allocationPercent, endsAt: input.endsAt, roleLabel: input.roleLabel, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The resource allocation changed before the update.", 409);
    return prisma.resourceAllocation.findUniqueOrThrow({ where: { id: item.id } });
  }

  private async assertAllocation(projectId: string, organizationId: string, userId: string, percent: number, startsAt: Date, endsAt?: Date, excludeId?: string) {
    if (endsAt && endsAt <= startsAt) throw new AppError("VALIDATION_ERROR", "Allocation end must follow its start.", 422);
    const member = await prisma.projectMembership.findFirst({ where: { projectId, userId }, select: { id: true } });
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
    if (!member && project?.ownerId !== userId) throw new AppError("CONFLICT", "Allocated resources must be project members.", 409);
    const overlaps = await prisma.resourceAllocation.findMany({ where: { userId, id: excludeId ? { not: excludeId } : undefined, project: { organizationId }, startsAt: { lt: endsAt ?? new Date("9999-12-31") }, OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }] }, select: { allocationPercent: true } });
    if (overlaps.reduce((sum, item) => sum + item.allocationPercent, percent) > 100) throw new AppError("CONFLICT", "Overlapping resource allocations cannot exceed 100 percent.", 409);
  }

  private async createTemplate(context: TenantContext, projectId: string, organizationId: string, input: Extract<CreateInput, { type: "template" }>) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { milestones: true, tasks: true } });
    if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
    const snapshot = { sourceProjectId: projectId, milestones: project.milestones.map(({ title, description }) => ({ title, description })), tasks: project.tasks.map(({ title, description, priority, position }) => ({ title, description, priority, position })) };
    return prisma.projectTemplate.create({ data: { organizationId, createdById: context.userId, name: input.name, description: input.description, snapshot: json(snapshot), isActive: input.publish, publishedAt: input.publish ? new Date() : null } });
  }

  private async transitionTemplate(context: TenantContext, projectId: string, organizationId: string, input: Extract<TransitionInput, { type: "template" }>) {
    const template = await prisma.projectTemplate.findFirst({ where: { id: input.id, organizationId } });
    if (!template) throw new AppError("NOT_FOUND", "Project template not found.", 404);
    if (input.action !== "APPLY") {
      const changed = await prisma.projectTemplate.updateMany({ where: { id: template.id, organizationId, version: input.expectedVersion }, data: input.action === "PUBLISH" ? { isActive: true, publishedAt: new Date(), archivedAt: null, version: { increment: 1 } } : { isActive: false, archivedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The template changed before the transition.", 409);
      return prisma.projectTemplate.findUniqueOrThrow({ where: { id: template.id } });
    }
    if (!template.isActive) throw new AppError("CONFLICT", "Only a published template can be applied.", 409);
    const snapshot = template.snapshot as { milestones?: Array<{ title: string; description?: string }>; tasks?: Array<{ title: string; description?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; position?: number }> };
    return prisma.$transaction(async (tx) => {
      for (const milestone of snapshot.milestones ?? []) await tx.projectMilestone.create({ data: { projectId, title: milestone.title, description: milestone.description } });
      for (const task of snapshot.tasks ?? []) await tx.projectTask.create({ data: { projectId, creatorId: context.userId, title: task.title, description: task.description, priority: task.priority ?? "MEDIUM", position: task.position ?? 0 } });
      await this.activity(tx, context, projectId, "ProjectTemplate", template.id, "Project template applied.", { templateVersion: template.version });
      return { applied: true, milestoneCount: snapshot.milestones?.length ?? 0, taskCount: snapshot.tasks?.length ?? 0 };
    });
  }

  private async calculateHealth(projectId: string) {
    const now = new Date();
    const [tasks, risks, issues, deliverables, changes, sheets] = await Promise.all([
      prisma.projectTask.findMany({ where: { projectId }, select: { status: true, dueAt: true } }),
      prisma.projectRisk.findMany({ where: { projectId }, select: { status: true, severity: true } }),
      prisma.projectIssue.findMany({ where: { projectId }, select: { status: true, severity: true, dueAt: true } }),
      prisma.deliverable.findMany({ where: { projectId }, select: { status: true, dueAt: true } }),
      prisma.changeRequest.findMany({ where: { projectId }, select: { status: true } }),
      prisma.timesheet.findMany({ where: { projectId }, select: { status: true } }),
    ]);
    const overdueTasks = tasks.filter((item) => item.dueAt && item.dueAt < now && !["DONE", "CANCELLED"].includes(item.status)).length;
    const criticalRisks = risks.filter((item) => item.severity === "CRITICAL" && !["ACCEPTED", "CLOSED"].includes(item.status)).length;
    const openIssues = issues.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length;
    const overdueDeliverables = deliverables.filter((item) => item.dueAt && item.dueAt < now && !["ACCEPTED", "REJECTED"].includes(item.status)).length;
    const pendingChanges = changes.filter((item) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(item.status)).length;
    const pendingTimesheets = sheets.filter((item) => item.status === "SUBMITTED").length;
    const score = Math.max(0, 100 - Math.min(30, overdueTasks * 3) - Math.min(30, criticalRisks * 15) - Math.min(20, openIssues * 4) - Math.min(10, overdueDeliverables * 5) - Math.min(5, pendingChanges) - Math.min(5, pendingTimesheets));
    return { score, grade: score >= 85 ? "HEALTHY" : score >= 65 ? "WATCH" : "AT_RISK", signals: { overdueTasks, criticalRisks, openIssues, overdueDeliverables, pendingChanges, pendingTimesheets }, calculatedAt: now.toISOString() };
  }

  private async snapshotHealth(context: TenantContext, projectId: string) {
    const health = await this.calculateHealth(projectId);
    return prisma.projectHealthSnapshot.create({ data: { projectId, score: health.score, signals: json(health.signals), source: "PHASE6_RULE_ENGINE" } });
  }

  private async completeProject(context: TenantContext, projectId: string, role: string) {
    if (role !== "OWNER" && role !== "MANAGER") throw new AppError("FORBIDDEN", "Project completion requires manager access.", 403);
    const [tasks, deliverables, issues, risks, changes, timesheets] = await Promise.all([
      prisma.projectTask.count({ where: { projectId, status: { notIn: ["DONE", "CANCELLED"] } } }),
      prisma.deliverable.count({ where: { projectId, status: { notIn: ["ACCEPTED", "REJECTED"] } } }),
      prisma.projectIssue.count({ where: { projectId, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      prisma.projectRisk.count({ where: { projectId, status: { notIn: ["ACCEPTED", "CLOSED"] } } }),
      prisma.changeRequest.count({ where: { projectId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } } }),
      prisma.timesheet.count({ where: { projectId, status: { in: ["DRAFT", "SUBMITTED", "REJECTED", "APPROVED"] } } }),
    ]);
    if (tasks + deliverables + issues + risks + changes + timesheets > 0) throw new AppError("CONFLICT", "Resolve all delivery records and lock timesheets before completing the project.", 409);
    const changed = await prisma.project.updateMany({ where: { id: projectId, organizationId: context.organizationId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { status: "COMPLETED" } });
    if (changed.count !== 1) throw new AppError("CONFLICT", "The project cannot be completed from its current state.", 409);
    return prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  private activity(tx: Prisma.TransactionClient, context: TenantContext, projectId: string, resourceType: string, resourceId: string, summary: string, metadata?: unknown) {
    return tx.projectActivity.create({ data: { projectId, actorUserId: context.userId, type: "PROJECT_UPDATED", resourceType, resourceId, summary, metadata: metadata === undefined ? undefined : json(metadata) } });
  }
}
