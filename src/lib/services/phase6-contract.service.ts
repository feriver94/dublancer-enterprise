import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";

type ContractParty = "CLIENT" | "PROVIDER";
type DisputeState = "OPEN" | "EVIDENCE_COLLECTION" | "MEDIATION" | "RESOLVED" | "CLOSED" | "CANCELLED";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const contractInclude = {
  acceptances: { include: { acceptedBy: { select: { id: true, displayName: true } } }, orderBy: { acceptedAt: "asc" as const } },
  amendments: { include: { proposedBy: { select: { id: true, displayName: true } }, decidedBy: { select: { id: true, displayName: true } } }, orderBy: { version: "desc" as const } },
  milestones: { include: { submissions: { include: { decisions: true }, orderBy: { revision: "desc" as const } }, paymentSchedules: true, closedBy: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } },
  disputes: { include: { openedBy: { select: { id: true, displayName: true } }, assignedTo: { select: { id: true, displayName: true } }, events: { include: { actor: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } } }, orderBy: { createdAt: "desc" as const } },
  reviews: { include: { reviewer: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" as const } },
  project: { include: { tasks: { select: { id: true, status: true } }, deliverables: { select: { id: true, status: true } }, milestones: { select: { id: true, status: true } } } },
} satisfies Prisma.ContractInclude;

export class Phase6ContractService {
  private async contract(context: TenantContext, contractId: string) {
    await requirePermission(context, "marketplace.contract.manage");
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, OR: [{ organizationId: context.organizationId }, { providerOrganizationId: context.organizationId }, { providerUserId: context.userId }] },
      include: contractInclude,
    });
    if (!contract) throw new AppError("NOT_FOUND", "Contract not found.", 404);
    return contract;
  }

  private party(context: TenantContext, contract: { organizationId: string; providerOrganizationId: string | null; providerUserId: string | null }): ContractParty {
    if (contract.organizationId === context.organizationId) return "CLIENT";
    if (contract.providerOrganizationId === context.organizationId || contract.providerUserId === context.userId) return "PROVIDER";
    throw new AppError("FORBIDDEN", "The active tenant is not a contract party.", 403);
  }

  private async partyForUser(contract: { organizationId: string; providerOrganizationId: string | null; providerUserId: string | null }, userId: string): Promise<ContractParty> {
    if (contract.providerUserId === userId) return "PROVIDER";
    if (contract.providerOrganizationId) {
      const provider = await prisma.membership.findFirst({ where: { organizationId: contract.providerOrganizationId, userId, status: "ACTIVE" }, select: { id: true } });
      if (provider) return "PROVIDER";
    }
    const client = await prisma.membership.findFirst({ where: { organizationId: contract.organizationId, userId, status: "ACTIVE" }, select: { id: true } });
    if (client) return "CLIENT";
    throw new AppError("CONFLICT", "The amendment proposer is no longer a contract party.", 409);
  }

  async amendments(context: TenantContext, contractId: string) {
    return (await this.contract(context, contractId)).amendments;
  }

  async createAmendment(context: TenantContext, contractId: string, input: { summary: string; changes: Record<string, unknown>; submit: boolean }) {
    const contract = await this.contract(context, contractId);
    this.party(context, contract);
    if (!["ACTIVE", "PAUSED"].includes(contract.status)) throw new AppError("CONFLICT", "Only active or paused contracts can be amended.", 409);
    const allowed = new Set(["title", "terms", "valueMinor", "startsAt", "endsAt"]);
    const keys = Object.keys(input.changes);
    if (!keys.length || keys.some((key) => !allowed.has(key))) throw new AppError("VALIDATION_ERROR", "Amendments may change only title, terms, value, start date, or end date.", 422);
    if (input.submit && contract.amendments.some((item) => item.status === "PROPOSED")) throw new AppError("CONFLICT", "Another amendment is already awaiting a decision.", 409);

    try {
      return await prisma.$transaction(async (tx) => {
        const latest = await tx.contractAmendment.aggregate({ where: { contractId }, _max: { version: true } });
        const amendment = await tx.contractAmendment.create({ data: {
          contractId,
          proposedById: context.userId,
          version: (latest._max.version ?? 0) + 1,
          status: input.submit ? "PROPOSED" : "DRAFT",
          summary: input.summary,
          changes: json(input.changes),
          baseContractVersion: contract.version,
          proposedAt: input.submit ? new Date() : null,
        } });
        await this.audit(tx, context, input.submit ? "contract.amendment.proposed" : "contract.amendment.drafted", "ContractAmendment", amendment.id, { contractId, version: amendment.version });
        await this.event(tx, contract, context.userId, "contract.amendment.changed", "ContractAmendment", amendment.id, { status: amendment.status, version: amendment.version });
        return amendment;
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new AppError("CONFLICT", "A concurrent amendment is already awaiting a decision.", 409);
      throw error;
    }
  }

  async decideAmendment(context: TenantContext, contractId: string, amendmentId: string, input: { decision: "ACCEPT" | "REJECT"; note: string; expectedAmendmentVersion: number; expectedContractVersion: number }) {
    const contract = await this.contract(context, contractId);
    const viewerParty = this.party(context, contract);
    const amendment = contract.amendments.find((item) => item.id === amendmentId);
    if (!amendment) throw new AppError("NOT_FOUND", "Contract amendment not found.", 404);
    if (amendment.status !== "PROPOSED") throw new AppError("CONFLICT", "This amendment already has a final decision.", 409);
    const proposerParty = await this.partyForUser(contract, amendment.proposedById);
    if (proposerParty === viewerParty) throw new AppError("FORBIDDEN", "The proposing party cannot decide its own amendment.", 403);
    if (amendment.rowVersion !== input.expectedAmendmentVersion || contract.version !== input.expectedContractVersion || amendment.baseContractVersion !== contract.version) {
      throw new AppError("CONFLICT", "The contract or amendment changed before the decision.", 409);
    }

    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.contractAmendment.updateMany({ where: { id: amendmentId, contractId, status: "PROPOSED", rowVersion: input.expectedAmendmentVersion }, data: { status: input.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", decidedById: context.userId, decidedAt: now, decisionNote: input.note, appliedAt: input.decision === "ACCEPT" ? now : null, rowVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The amendment changed before the decision.", 409);
      if (input.decision === "ACCEPT") {
        const changes = amendment.changes as Record<string, unknown>;
        const data: Prisma.ContractUpdateManyMutationInput = { version: { increment: 1 } };
        if (typeof changes.title === "string") data.title = changes.title;
        if (changes.terms && typeof changes.terms === "object") data.terms = json(changes.terms);
        if (typeof changes.valueMinor === "string" || typeof changes.valueMinor === "number") data.valueMinor = BigInt(changes.valueMinor);
        if (typeof changes.startsAt === "string") data.startsAt = new Date(changes.startsAt);
        if (typeof changes.endsAt === "string") data.endsAt = new Date(changes.endsAt);
        const contractChanged = await tx.contract.updateMany({ where: { id: contractId, version: input.expectedContractVersion, status: contract.status }, data });
        if (contractChanged.count !== 1) throw new AppError("CONFLICT", "The contract changed before the amendment was applied.", 409);
      }
      await this.audit(tx, context, `contract.amendment.${input.decision === "ACCEPT" ? "accepted" : "rejected"}`, "ContractAmendment", amendmentId, { contractId, note: input.note });
      await this.event(tx, contract, context.userId, "contract.amendment.decided", "ContractAmendment", amendmentId, { decision: input.decision, decidedAt: now.toISOString() });
      return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: contractInclude });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  async disputes(context: TenantContext, contractId: string) {
    return (await this.contract(context, contractId)).disputes;
  }

  async openDispute(context: TenantContext, contractId: string, input: { category: string; reason: string; againstUserId?: string; evidence?: Record<string, unknown> }) {
    const contract = await this.contract(context, contractId);
    if (!["ACTIVE", "PAUSED", "DISPUTED"].includes(contract.status)) throw new AppError("CONFLICT", "A dispute cannot be opened in the current contract state.", 409);
    if (contract.disputes.some((item) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(item.status))) throw new AppError("CONFLICT", "An active dispute already exists for this contract.", 409);
    return prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({ data: { contractId, openedById: context.userId, againstUserId: input.againstUserId, category: input.category, reason: input.reason, evidence: input.evidence ? json(input.evidence) : undefined } });
      await tx.disputeEvent.create({ data: { disputeId: dispute.id, actorUserId: context.userId, status: "OPEN", note: input.reason, evidence: input.evidence ? json(input.evidence) : undefined } });
      if (contract.status !== "DISPUTED") await tx.contract.updateMany({ where: { id: contractId, version: contract.version }, data: { status: "DISPUTED", version: { increment: 1 } } });
      await this.audit(tx, context, "contract.dispute.opened", "Dispute", dispute.id, { contractId, category: input.category });
      await this.event(tx, contract, context.userId, "contract.dispute.opened", "Dispute", dispute.id, { category: input.category });
      return tx.dispute.findUniqueOrThrow({ where: { id: dispute.id }, include: { events: true } });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  async transitionDispute(context: TenantContext, contractId: string, disputeId: string, input: { status: DisputeState; note: string; evidence?: Record<string, unknown>; resolution?: Record<string, unknown>; assignedToId?: string; expectedVersion: number }) {
    const contract = await this.contract(context, contractId);
    const party = this.party(context, contract);
    const dispute = contract.disputes.find((item) => item.id === disputeId);
    if (!dispute) throw new AppError("NOT_FOUND", "Dispute not found.", 404);
    const allowed: Record<DisputeState, DisputeState[]> = {
      OPEN: ["EVIDENCE_COLLECTION", "CANCELLED"],
      EVIDENCE_COLLECTION: ["MEDIATION", "RESOLVED", "CANCELLED"],
      MEDIATION: ["RESOLVED", "CANCELLED"],
      RESOLVED: ["CLOSED", "MEDIATION"],
      CLOSED: [],
      CANCELLED: [],
    };
    if (!allowed[dispute.status].includes(input.status)) throw new AppError("CONFLICT", `Invalid dispute transition from ${dispute.status} to ${input.status}.`, 409);
    if (["RESOLVED", "CLOSED"].includes(input.status) && party !== "CLIENT") throw new AppError("FORBIDDEN", "Only the client party can finalize a dispute resolution.", 403);
    if (input.status === "RESOLVED" && !input.resolution) throw new AppError("VALIDATION_ERROR", "Resolution details are required.", 422);
    if (input.assignedToId) {
      const assignee = await prisma.membership.findFirst({ where: { organizationId: contract.organizationId, userId: input.assignedToId, status: "ACTIVE" }, select: { id: true } });
      if (!assignee) throw new AppError("CONFLICT", "The dispute assignee must be an active client organization member.", 409);
    }
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.dispute.updateMany({ where: { id: disputeId, contractId, status: dispute.status, version: input.expectedVersion }, data: { status: input.status, evidence: input.evidence ? json(input.evidence) : undefined, resolution: input.resolution ? json(input.resolution) : undefined, assignedToId: input.assignedToId, resolvedAt: input.status === "RESOLVED" ? now : undefined, closedAt: input.status === "CLOSED" ? now : undefined, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The dispute changed before the transition.", 409);
      await tx.disputeEvent.create({ data: { disputeId, actorUserId: context.userId, previousStatus: dispute.status, status: input.status, note: input.note, evidence: input.evidence ? json(input.evidence) : undefined } });
      if (["RESOLVED", "CLOSED", "CANCELLED"].includes(input.status)) {
        const remaining = await tx.dispute.count({ where: { contractId, id: { not: disputeId }, status: { in: ["OPEN", "EVIDENCE_COLLECTION", "MEDIATION"] } } });
        if (!remaining) await tx.contract.updateMany({ where: { id: contractId, status: "DISPUTED" }, data: { status: "ACTIVE", version: { increment: 1 } } });
      }
      await this.audit(tx, context, `contract.dispute.${input.status.toLowerCase()}`, "Dispute", disputeId, { contractId, previousStatus: dispute.status, note: input.note });
      await this.event(tx, contract, context.userId, "contract.dispute.changed", "Dispute", disputeId, { previousStatus: dispute.status, status: input.status });
      return tx.dispute.findUniqueOrThrow({ where: { id: disputeId }, include: { events: { include: { actor: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" } } } });
    });
  }

  async closeMilestone(context: TenantContext, contractId: string, milestoneId: string, input: { note: string; expectedVersion: number }) {
    const contract = await this.contract(context, contractId);
    if (this.party(context, contract) !== "CLIENT") throw new AppError("FORBIDDEN", "Only the client can close out a milestone.", 403);
    const milestone = contract.milestones.find((item) => item.id === milestoneId);
    if (!milestone) throw new AppError("NOT_FOUND", "Contract milestone not found.", 404);
    if (milestone.closedAt) return milestone;
    if (!["RELEASED", "CANCELLED"].includes(milestone.status)) throw new AppError("CONFLICT", "Only released or cancelled milestones can be closed out.", 409);
    const updated = await prisma.contractMilestone.updateMany({ where: { id: milestoneId, contractId, version: input.expectedVersion, closedAt: null }, data: { closedAt: new Date(), closedById: context.userId, closeoutNote: input.note, version: { increment: 1 } } });
    if (updated.count !== 1) throw new AppError("CONFLICT", "The milestone changed before closeout.", 409);
    return prisma.contractMilestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { closedBy: { select: { id: true, displayName: true } } } });
  }

  async complete(context: TenantContext, contractId: string, input: { note: string; checklist: Record<string, boolean>; expectedVersion: number }) {
    const contract = await this.contract(context, contractId);
    if (this.party(context, contract) !== "CLIENT") throw new AppError("FORBIDDEN", "Only the client can complete a contract.", 403);
    if (contract.status !== "ACTIVE") throw new AppError("CONFLICT", "Only an active contract can be completed.", 409);
    if (contract.disputes.some((item) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(item.status))) throw new AppError("CONFLICT", "Resolve every active dispute before completion.", 409);
    if (!contract.milestones.length || contract.milestones.some((item) => !["RELEASED", "CANCELLED"].includes(item.status) || !item.closedAt)) throw new AppError("CONFLICT", "Every milestone must be released or cancelled and closed out before completion.", 409);
    if (!Object.values(input.checklist).length || Object.values(input.checklist).some((value) => !value)) throw new AppError("VALIDATION_ERROR", "Every final completion checklist item must be confirmed.", 422);
    if (contract.project) {
      const unfinishedTasks = contract.project.tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
      const unsettledDeliverables = contract.project.deliverables.filter((item) => !["ACCEPTED", "REJECTED"].includes(item.status));
      if (unfinishedTasks.length || unsettledDeliverables.length) throw new AppError("CONFLICT", "Complete project tasks and decide all deliverables before final completion.", 409);
    }
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.contract.updateMany({ where: { id: contractId, status: "ACTIVE", version: input.expectedVersion }, data: { status: "COMPLETED", completedAt: now, completedById: context.userId, completionNote: input.note, completionChecklist: json(input.checklist), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "The contract changed before final completion.", 409);
      if (contract.projectId) await tx.project.updateMany({ where: { id: contract.projectId, organizationId: contract.organizationId, status: { notIn: ["CANCELLED", "COMPLETED"] } }, data: { status: "COMPLETED" } });
      await this.audit(tx, context, "contract.completed", "Contract", contractId, { note: input.note, checklist: input.checklist, projectId: contract.projectId });
      await this.event(tx, contract, context.userId, "contract.completed", "Contract", contractId, { completedAt: now.toISOString(), projectId: contract.projectId });
      return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: contractInclude });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  async reviews(context: TenantContext, contractId: string) {
    const contract = await this.contract(context, contractId);
    const party = this.party(context, contract);
    return contract.reviews.filter((review) => review.status === "PUBLISHED" || review.reviewerParty === party);
  }

  async createReview(context: TenantContext, contractId: string, input: { rating: number; title?: string; body?: string }) {
    const contract = await this.contract(context, contractId);
    const party = this.party(context, contract);
    if (contract.status !== "COMPLETED") throw new AppError("CONFLICT", "Reviews are available after final contract completion.", 409);
    if (contract.reviews.some((review) => review.reviewerParty === party)) throw new AppError("CONFLICT", "This contract party already submitted a review.", 409);
    const revieweeOrganizationId = party === "PROVIDER" ? contract.organizationId : contract.providerOrganizationId;
    const revieweeUserId = party === "CLIENT" && !contract.providerOrganizationId ? contract.providerUserId : null;
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const review = await tx.review.create({ data: { contractId, reviewerId: context.userId, reviewerParty: party, revieweeOrganizationId, revieweeUserId, rating: input.rating, title: input.title, body: input.body, status: "PUBLISHED", submittedAt: now, publishedAt: now } });
      await this.audit(tx, context, "contract.review.published", "Review", review.id, { contractId, party, rating: input.rating });
      await this.event(tx, contract, context.userId, "contract.review.published", "Review", review.id, { party, rating: input.rating });
      return review;
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  private audit(tx: Prisma.TransactionClient, context: TenantContext, action: string, resourceType: string, resourceId: string, metadata: unknown) {
    return tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action, resourceType, resourceId, outcome: "SUCCESS", metadata: json(metadata) } });
  }

  private event(tx: Prisma.TransactionClient, contract: { organizationId: string; projectId: string | null }, actorUserId: string, eventType: string, aggregateType: string, aggregateId: string, payload: unknown) {
    return tx.realtimeEvent.create({ data: { organizationId: contract.organizationId, projectId: contract.projectId, actorUserId, topic: contract.projectId ? `project:${contract.projectId}` : `organization:${contract.organizationId}`, eventType, aggregateType, aggregateId, payload: json(payload) } });
  }
}
