import { createHash,randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { hashContractTerms } from "@/lib/services/product-platform.service";
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function commercialAudit(tx: Prisma.TransactionClient, context: TenantContext, action: string, resourceType: string, resourceId: string, metadata?: unknown) {
  return tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action, resourceType, resourceId, outcome: "SUCCESS", metadata: metadata === undefined ? undefined : json(metadata) } });
}

function commercialEvent(tx: Prisma.TransactionClient, context: TenantContext, eventType: string, aggregateType: string, aggregateId: string, payload: unknown, projectId?: string | null) {
  return tx.realtimeEvent.create({ data: { organizationId: context.organizationId, projectId, actorUserId: context.userId, topic: projectId ? `project:${projectId}` : `organization:${context.organizationId}`, eventType, aggregateType, aggregateId, payload: json(payload) } });
}

export class MarketplaceLifecycleService {
  async get(context: TenantContext, id: string) {
    await requirePermission(context, "marketplace.listing.read");
    const visible = await prisma.marketplaceListing.findFirst({
      where: { id, OR: [{ organizationId: context.organizationId }, { status: "PUBLISHED", visibility: "PUBLIC" }] },
      select: { id: true, organizationId: true },
    });
    if (!visible) throw new AppError("NOT_FOUND", "Listing not found.", 404);
    const isOwner = visible.organizationId === context.organizationId;
    const authorization = await resolveAuthorization(context);
    const canReviewProposals = authorization.isPlatformAdmin || authorization.permissions.includes("marketplace.proposal.review");
    const row = await prisma.marketplaceListing.findUniqueOrThrow({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        skills: { include: { skill: true } },
        proposals: {
          where: isOwner && canReviewProposals ? {} : { submittedById: context.userId },
          include: {
            submittedBy: { select: { id: true, displayName: true } },
            freelancerProfile: { select: { headline: true, userId: true } },
            contract: { select: { id: true, status: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
        contracts: { select: { id: true, status: true, proposalId: true } },
        _count: { select: { proposals: true, savedBy: true } },
      },
    });
    return { ...row, isOwner, canReviewProposals };
  }

  async update(context: TenantContext, id: string, input: Record<string, unknown>) {
    await requirePermission(context, "marketplace.listing.manage");
    if (input.status === "AWARDED") {
      throw new AppError("CONFLICT", "Listings can only be awarded through the atomic proposal award endpoint.", 409);
    }
    const row = await prisma.marketplaceListing.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row) throw new AppError("NOT_FOUND", "Listing not found.", 404);
    return prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...input,
        publishedAt: input.status === "PUBLISHED" ? (row.publishedAt ?? new Date()) : undefined,
        closedAt: input.status === "CLOSED" ? new Date() : undefined,
        version: { increment: 1 },
      } as Prisma.MarketplaceListingUpdateInput,
    });
  }

  async save(context: TenantContext, id: string, active: boolean) {
    await this.get(context, id);
    if (active) {
      await prisma.savedListing.upsert({ where: { userId_listingId: { userId: context.userId, listingId: id } }, create: { userId: context.userId, listingId: id }, update: {} });
    } else {
      await prisma.savedListing.deleteMany({ where: { userId: context.userId, listingId: id } });
    }
    return { saved: active };
  }
}

export class ContractLifecycleService {
  private include = {
    acceptances: { include: { acceptedBy: { select: { id: true, displayName: true } } }, orderBy: { acceptedAt: "asc" as const } },
    amendments: { include: { proposedBy: { select: { id: true, displayName: true } }, decidedBy: { select: { id: true, displayName: true } } }, orderBy: { version: "desc" as const } },
    milestones: { include: { submissions: { include: { decisions: true, submittedBy: { select: { id: true, displayName: true } } }, orderBy: { revision: "desc" as const } }, paymentSchedules: true, closedBy: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } },
    invoices: { include: { transactions: { include: { refunds: true } } }, orderBy: { createdAt: "desc" as const } },
    transactions: { include: { refunds: true }, orderBy: { createdAt: "desc" as const } },
    disputes: { include: { openedBy: { select: { id: true, displayName: true } }, assignedTo: { select: { id: true, displayName: true } }, events: { include: { actor: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } } }, orderBy: { createdAt: "desc" as const } },
    reviews: { include: { reviewer: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" as const } },
    project: true,
    listing: true,
    proposal: true,
  };

  private async access(context: TenantContext, id: string) {
    const row = await prisma.contract.findFirst({
      where: { id, OR: [{ organizationId: context.organizationId }, { providerOrganizationId: context.organizationId }, { providerUserId: context.userId }] },
      include: this.include,
    });
    if (!row) throw new AppError("NOT_FOUND", "Contract not found.", 404);
    return row;
  }

  private party(context: TenantContext, row: { organizationId: string; providerOrganizationId: string | null; providerUserId: string | null }, requested?: "CLIENT" | "PROVIDER") {
    const client = row.organizationId === context.organizationId;
    const provider = row.providerOrganizationId === context.organizationId || row.providerUserId === context.userId;
    if (requested === "CLIENT" && client) return "CLIENT" as const;
    if (requested === "PROVIDER" && provider) return "PROVIDER" as const;
    if (!requested && client) return "CLIENT" as const;
    if (!requested && provider) return "PROVIDER" as const;
    throw new AppError("FORBIDDEN", "The active tenant is not an eligible contract party.", 403);
  }

  async get(context: TenantContext, id: string) {
    await requirePermission(context, "marketplace.contract.manage");
    const row = await this.access(context, id);
    return { ...row, viewerParty: this.party(context, row), termsHash: hashContractTerms(row.terms) };
  }

  async transition(context: TenantContext, id: string, status: "PENDING_SIGNATURES" | "ACTIVE" | "PAUSED" | "COMPLETED" | "TERMINATED" | "DISPUTED", expectedVersion: number) {
    await requirePermission(context, "marketplace.contract.manage");
    if (status === "COMPLETED") {
      throw new AppError("CONFLICT", "Use the final contract completion workflow so milestone closeout, disputes, delivery evidence, and the completion checklist are verified.", 409);
    }
    const row = await this.access(context, id);
    const party = this.party(context, row);
    const allowed: Record<string, string[]> = {
      DRAFT: ["PENDING_SIGNATURES", "TERMINATED"],
      PENDING_SIGNATURES: ["TERMINATED"],
      ACTIVE: ["PAUSED", "TERMINATED", "DISPUTED"],
      PAUSED: ["ACTIVE", "TERMINATED", "DISPUTED"],
      DISPUTED: ["ACTIVE", "TERMINATED"],
    };
    if (!(allowed[row.status] ?? []).includes(status)) throw new AppError("CONFLICT", `Invalid contract transition from ${row.status} to ${status}.`, 409);
    if (["PENDING_SIGNATURES", "TERMINATED"].includes(status) && party !== "CLIENT") {
      throw new AppError("FORBIDDEN", "Only the client organization can apply this contract transition.", 403);
    }
    return prisma.$transaction(async (tx) => {
      const changed = await tx.contract.updateMany({ where: { id, status: row.status, version: expectedVersion }, data: { status, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "Contract changed before the transition was applied.", 409);
      await commercialAudit(tx, context, `contract.${status.toLowerCase()}`, "Contract", id, { previousStatus: row.status });
      await commercialEvent(tx, { ...context, organizationId: row.organizationId }, "contract.status.changed", "Contract", id, { previousStatus: row.status, status }, row.projectId);
      return tx.contract.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async accept(context: TenantContext, id: string, input: { expectedVersion: number; party: "CLIENT" | "PROVIDER"; method: "CLICKWRAP" | "ELECTRONIC_SIGNATURE"; termsHash: string }, evidence: { ipAddress: string | null; userAgent: string | null }) {
    await requirePermission(context, "marketplace.contract.manage");
    const row = await this.access(context, id);
    const party = this.party(context, row, input.party);
    const termsHash = hashContractTerms(row.terms);
    if (row.status !== "PENDING_SIGNATURES") throw new AppError("CONFLICT", "This contract is not awaiting acceptance.", 409);
    if (input.termsHash.toLowerCase() !== termsHash) throw new AppError("CONFLICT", "Contract terms changed before acceptance.", 409);
    const existing = row.acceptances.find((acceptance) => acceptance.party === party);
    if (existing) {
      if (existing.termsHash === termsHash && existing.acceptedById === context.userId) return this.get(context, id);
      throw new AppError("CONFLICT", `${party.toLowerCase()} acceptance is already recorded.`, 409);
    }
    if (row.version !== input.expectedVersion) throw new AppError("CONFLICT", "Contract changed before acceptance.", 409);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.contractAcceptance.create({ data: { contractId: id, party, acceptedById: context.userId, organizationId: context.organizationId, termsHash, method: input.method, ipAddress: evidence.ipAddress, userAgent: evidence.userAgent } });
        const acceptanceCount = await tx.contractAcceptance.count({ where: { contractId: id } });
        const changed = await tx.contract.updateMany({
          where: { id, status: "PENDING_SIGNATURES", version: input.expectedVersion },
          data: { status: acceptanceCount === 2 ? "ACTIVE" : "PENDING_SIGNATURES", signedAt: acceptanceCount === 2 ? new Date() : undefined, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw new AppError("CONFLICT", "Contract changed before acceptance was recorded.", 409);
        await commercialAudit(tx, context, `contract.acceptance.${party.toLowerCase()}`, "ContractAcceptance", id, { party, termsHash, method: input.method });
        await commercialEvent(tx, { ...context, organizationId: row.organizationId }, acceptanceCount === 2 ? "contract.activated" : "contract.acceptance.recorded", "Contract", id, { party, acceptanceCount, termsHash }, row.projectId);
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new AppError("CONFLICT", "A concurrent contract acceptance was recorded. Refresh and retry.", 409);
      throw error;
    }
    return this.get(context, id);
  }

  async amendment(context: TenantContext, id: string, input: { summary: string; changes: Record<string, unknown>; submit: boolean }) {
    await requirePermission(context, "marketplace.contract.manage");
    await this.access(context, id);
    const last = await prisma.contractAmendment.aggregate({ where: { contractId: id }, _max: { version: true } });
    return prisma.contractAmendment.create({ data: { contractId: id, proposedById: context.userId, version: (last._max.version ?? 0) + 1, summary: input.summary, changes: json(input.changes), status: input.submit ? "PROPOSED" : "DRAFT" } });
  }

  async milestone(context: TenantContext, id: string, input: { title: string; description?: string; amountMinor: bigint; currency: string; dueAt?: Date }) {
    await requirePermission(context, "marketplace.contract.manage");
    const row = await this.access(context, id);
    if (this.party(context, row) !== "CLIENT") throw new AppError("FORBIDDEN", "Only the client can create contract milestones.", 403);
    if (!["PENDING_SIGNATURES", "ACTIVE"].includes(row.status)) throw new AppError("CONFLICT", "Milestones cannot be added in the current contract state.", 409);
    return prisma.$transaction(async (tx) => {
      const milestone = await tx.contractMilestone.create({ data: { contractId: id, ...input } });
      await commercialAudit(tx, context, "contract.milestone.created", "ContractMilestone", milestone.id, { contractId: id, amountMinor: input.amountMinor.toString(), currency: input.currency });
      return milestone;
    });
  }

  async submissions(context: TenantContext, contractId: string, milestoneId: string) {
    await requirePermission(context, "marketplace.contract.manage");
    await this.access(context, contractId);
    return prisma.workSubmission.findMany({ where: { contractMilestoneId: milestoneId, contractMilestone: { contractId } }, include: { decisions: true, submittedBy: { select: { id: true, displayName: true } } }, orderBy: { revision: "desc" } });
  }

  async submitMilestone(context: TenantContext, contractId: string, milestoneId: string, input: { note: string; expectedMilestoneVersion: number }) {
    await requirePermission(context, "marketplace.contract.manage");
    const row = await this.access(context, contractId);
    if (this.party(context, row) !== "PROVIDER") throw new AppError("FORBIDDEN", "Only the provider can submit milestone work.", 403);
    if (row.status !== "ACTIVE") throw new AppError("CONFLICT", "The contract must be active before milestone submission.", 409);
    const milestone = row.milestones.find((item) => item.id === milestoneId);
    if (!milestone) throw new AppError("NOT_FOUND", "Contract milestone not found.", 404);
    if (!["PLANNED", "FUNDED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(milestone.status)) throw new AppError("CONFLICT", "Milestone cannot be submitted in its current state.", 409);

    try {
      return await prisma.$transaction(async (tx) => {
        const active = await tx.workSubmission.count({ where: { contractMilestoneId: milestoneId, status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
        if (active) throw new AppError("CONFLICT", "A milestone submission is already awaiting a decision.", 409);
        const latest = await tx.workSubmission.aggregate({ where: { contractMilestoneId: milestoneId }, _max: { revision: true } });
        const changed = await tx.contractMilestone.updateMany({ where: { id: milestoneId, contractId, version: input.expectedMilestoneVersion, status: milestone.status }, data: { status: "SUBMITTED", version: { increment: 1 } } });
        if (changed.count !== 1) throw new AppError("CONFLICT", "Milestone changed before submission.", 409);
        const submission = await tx.workSubmission.create({ data: { contractMilestoneId: milestoneId, submittedById: context.userId, status: "SUBMITTED", note: input.note, submittedAt: new Date(), revision: (latest._max.revision ?? 0) + 1 } });
        await commercialAudit(tx, context, "contract.milestone.submitted", "WorkSubmission", submission.id, { contractId, milestoneId, revision: submission.revision });
        await commercialEvent(tx, { ...context, organizationId: row.organizationId }, "contract.milestone.submitted", "ContractMilestone", milestoneId, { submissionId: submission.id, revision: submission.revision }, row.projectId);
        return submission;
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new AppError("CONFLICT", "A concurrent milestone submission already exists.", 409);
      throw error;
    }
  }

  async decideSubmission(context: TenantContext, contractId: string, milestoneId: string, input: { submissionId: string; decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED"; note: string; expectedMilestoneVersion: number; expectedSubmissionVersion: number }) {
    await requirePermission(context, "marketplace.contract.manage");
    const row = await this.access(context, contractId);
    if (this.party(context, row) !== "CLIENT") throw new AppError("FORBIDDEN", "Only the client can decide milestone submissions.", 403);
    if (row.status !== "ACTIVE") throw new AppError("CONFLICT", "The contract must be active to decide milestone work.", 409);
    const milestone = row.milestones.find((item) => item.id === milestoneId);
    if (!milestone) throw new AppError("NOT_FOUND", "Contract milestone not found.", 404);
    const submission = milestone.submissions.find((item) => item.id === input.submissionId);
    if (!submission) throw new AppError("NOT_FOUND", "Milestone submission not found.", 404);
    if (!["SUBMITTED", "IN_REVIEW"].includes(submission.status)) throw new AppError("CONFLICT", "Submission already has an immutable decision.", 409);
    const resultingStatus = input.decision === "APPROVED" ? "ACCEPTED" : input.decision === "REJECTED" ? "REJECTED" : "REVISION_REQUESTED";
    const milestoneStatus = input.decision === "APPROVED" ? "ACCEPTED" : "REVISION_REQUESTED";

    return prisma.$transaction(async (tx) => {
      const submissionChanged = await tx.workSubmission.updateMany({ where: { id: submission.id, contractMilestoneId: milestoneId, status: { in: ["SUBMITTED", "IN_REVIEW"] }, version: input.expectedSubmissionVersion }, data: { status: resultingStatus, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
      const milestoneChanged = await tx.contractMilestone.updateMany({ where: { id: milestoneId, contractId, status: "SUBMITTED", version: input.expectedMilestoneVersion }, data: { status: milestoneStatus, acceptedAt: input.decision === "APPROVED" ? new Date() : undefined, version: { increment: 1 } } });
      if (submissionChanged.count !== 1 || milestoneChanged.count !== 1) throw new AppError("CONFLICT", "Submission or milestone changed before the decision.", 409);
      await tx.workSubmissionDecision.create({ data: { submissionId: submission.id, decision: input.decision, decidedById: context.userId, note: input.note, previousStatus: submission.status, resultingStatus } });
      await commercialAudit(tx, context, `contract.milestone.${input.decision.toLowerCase()}`, "WorkSubmission", submission.id, { contractId, milestoneId, previousStatus: submission.status, resultingStatus });
      await commercialEvent(tx, { ...context, organizationId: row.organizationId }, "contract.milestone.decided", "ContractMilestone", milestoneId, { submissionId: submission.id, decision: input.decision, status: milestoneStatus }, row.projectId);
      return tx.workSubmission.findUniqueOrThrow({ where: { id: submission.id }, include: { decisions: true, submittedBy: { select: { id: true, displayName: true } } } });
    });
  }

  async dispute(context: TenantContext, id: string, input: { category: string; reason: string; againstUserId?: string; evidence?: Record<string, unknown> }) {
    const row = await this.access(context, id);
    return prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({ data: { contractId: id, openedById: context.userId, againstUserId: input.againstUserId, category: input.category, reason: input.reason, evidence: input.evidence ? json(input.evidence) : undefined } });
      await tx.contract.update({ where: { id }, data: { status: "DISPUTED", version: { increment: 1 } } });
      await commercialAudit(tx, context, "contract.dispute.opened", "Dispute", dispute.id, { contractId: id });
      await commercialEvent(tx, { ...context, organizationId: row.organizationId }, "contract.dispute.opened", "Contract", id, { disputeId: dispute.id }, row.projectId);
      return dispute;
    });
  }
}

export class FileLifecycleService{
 private async file(context:TenantContext,id:string){const row=await prisma.fileNode.findFirst({where:{id,organizationId:context.organizationId},include:{versions:{orderBy:{version:"desc"}},lock:{include:{lockedBy:{select:{id:true,displayName:true}}}},accessGrants:true,activities:{orderBy:{createdAt:"desc"},take:100}}});if(!row)throw new AppError("NOT_FOUND","File not found.",404);return row;}
 async get(context:TenantContext,id:string){await requirePermission(context,"files.read");return this.file(context,id);}
 async update(context:TenantContext,id:string,input:{name?:string;retentionUntil?:Date|null;legalHold?:boolean;deleted?:boolean}){await requirePermission(context,"files.manage");const file=await this.file(context,id);if(input.deleted&&file.legalHold)throw new AppError("CONFLICT","A file under legal hold cannot be deleted.",409);const updated=await prisma.fileNode.update({where:{id},data:{name:input.name,retentionUntil:input.retentionUntil,legalHold:input.legalHold,deletedAt:input.deleted===true?new Date():input.deleted===false?null:undefined}});await prisma.fileActivity.create({data:{fileNodeId:id,actorUserId:context.userId,type:input.legalHold!==undefined?"LEGAL_HOLD_CHANGED":input.deleted===true?"DELETED":input.deleted===false?"RESTORED":"RENAMED",metadata:json({fields:Object.keys(input)})}});return updated;}
 async versions(context:TenantContext,id:string){await requirePermission(context,"files.read");return (await this.file(context,id)).versions;}
 async lock(context:TenantContext,id:string,minutes:number){await requirePermission(context,"files.manage");await this.file(context,id);const raw=randomBytes(32).toString("base64url");const tokenHash=createHash("sha256").update(raw).digest("hex");const lock=await prisma.fileLock.upsert({where:{fileNodeId:id},create:{fileNodeId:id,lockedById:context.userId,tokenHash,expiresAt:new Date(Date.now()+minutes*60000)},update:{lockedById:context.userId,tokenHash,expiresAt:new Date(Date.now()+minutes*60000)}});return{lock,lockToken:raw};}
 async unlock(context:TenantContext,id:string){await requirePermission(context,"files.manage");await this.file(context,id);await prisma.fileLock.deleteMany({where:{fileNodeId:id,OR:[{lockedById:context.userId},{expiresAt:{lte:new Date()}}]}});return{unlocked:true};}
}

export class BillingAdministrationService{
 async summary(context:TenantContext){await requirePermission(context,"finance.read");const[subscription,usage,credits,invoices,transactions]=await Promise.all([prisma.organizationSubscription.findUnique({where:{organizationId:context.organizationId},include:{plan:true}}),prisma.usageRecord.groupBy({by:["unit"],where:{organizationId:context.organizationId},_sum:{quantity:true}}),prisma.creditLedgerEntry.aggregate({where:{organizationId:context.organizationId},_sum:{amountMinor:true}}),prisma.invoice.groupBy({by:["status"],where:{organizationId:context.organizationId},_count:true,_sum:{totalMinor:true}}),prisma.financialTransaction.groupBy({by:["status"],where:{organizationId:context.organizationId},_count:true,_sum:{amountMinor:true}})]);return{subscription,usage,creditBalanceMinor:credits._sum.amountMinor??0,invoices,transactions,currency:"AED"};}
 async configure(context:TenantContext,input:{planId:string;status:"TRIALING"|"ACTIVE"|"PAST_DUE"|"PAUSED"|"CANCELLED"|"EXPIRED";currentPeriodEnd:Date;cancelAtPeriodEnd:boolean}){await requirePermission(context,"billing.manage");const plan=await prisma.subscriptionPlan.findFirst({where:{id:input.planId,isActive:true}});if(!plan)throw new AppError("NOT_FOUND","Subscription plan not found.",404);return prisma.organizationSubscription.upsert({where:{organizationId:context.organizationId},create:{organizationId:context.organizationId,planId:input.planId,status:input.status,currentPeriodStart:new Date(),currentPeriodEnd:input.currentPeriodEnd,cancelAtPeriodEnd:input.cancelAtPeriodEnd},update:{planId:input.planId,status:input.status,currentPeriodEnd:input.currentPeriodEnd,cancelAtPeriodEnd:input.cancelAtPeriodEnd}});}
}

export class ModerationComplianceService{
 async queue(context:TenantContext){await requirePermission(context,"moderation.manage");return prisma.abuseReport.findMany({where:{organizationId:context.organizationId},orderBy:{updatedAt:"desc"},take:100});}
 async decide(context:TenantContext,input:{reportId:string;status:"TRIAGED"|"INVESTIGATING"|"ACTIONED"|"DISMISSED";resolution:string}){await requirePermission(context,"moderation.manage");const updated=await prisma.abuseReport.updateMany({where:{id:input.reportId,organizationId:context.organizationId},data:{status:input.status,resolution:input.resolution,assignedToId:context.userId}});if(!updated.count)throw new AppError("NOT_FOUND","Abuse report not found.",404);return prisma.abuseReport.findUnique({where:{id:input.reportId}});}
 async retention(context:TenantContext,input?:{resourceType:string;retentionDays:number;legalHoldDefault:boolean;configuration?:Record<string,unknown>}){if(!input){await requirePermission(context,"compliance.manage");return prisma.dataRetentionPolicy.findMany({where:{organizationId:context.organizationId}});}await requirePermission(context,"compliance.manage");return prisma.dataRetentionPolicy.upsert({where:{organizationId_resourceType:{organizationId:context.organizationId,resourceType:input.resourceType}},create:{organizationId:context.organizationId,resourceType:input.resourceType,retentionDays:input.retentionDays,legalHoldDefault:input.legalHoldDefault,configuration:input.configuration?json(input.configuration):undefined},update:{retentionDays:input.retentionDays,legalHoldDefault:input.legalHoldDefault,configuration:input.configuration?json(input.configuration):undefined}});}
}
