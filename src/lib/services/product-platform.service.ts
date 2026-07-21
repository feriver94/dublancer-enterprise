import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { withTransaction } from "@/lib/database/transaction";
import { AppError } from "@/lib/errors/app-error";
import { paymentProvider, storageProvider } from "@/lib/providers/integrations";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { paymentWebhookSchema } from "@/lib/validation/product";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashContractTerms(terms: unknown) {
  return createHash("sha256").update(stable(terms)).digest("hex");
}

function audit(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: unknown,
) {
  return tx.auditEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      resourceType,
      resourceId,
      outcome: "SUCCESS",
      metadata: metadata === undefined ? undefined : json(metadata),
    },
  });
}

function isConcurrencyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code);
}

function nextCursor<T extends { id: string }>(items: T[], take: number) {
  return items.length > take ? items.pop()!.id : null;
}

async function projectInTenant(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
}

function event(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
  projectId?: string,
) {
  return tx.realtimeEvent.create({
    data: {
      organizationId: context.organizationId,
      projectId,
      actorUserId: context.userId,
      topic: projectId ? `project:${projectId}` : `organization:${context.organizationId}`,
      eventType,
      aggregateType,
      aggregateId,
      payload: json(payload),
    },
  });
}

export class MarketplaceService {
  async profile(context: TenantContext) {
    return prisma.freelancerProfile.findUnique({
      where: { userId: context.userId },
      include: { skills: { include: { skill: true } }, portfolioItems: true, workExperiences: true },
    });
  }

  async upsertProfile(context: TenantContext, input: Record<string, unknown>) {
    const data = input as Prisma.FreelancerProfileUncheckedCreateInput;
    const profile = await prisma.freelancerProfile.upsert({
      where: { userId: context.userId },
      create: { ...data, userId: context.userId },
      update: data,
    });
    return profile;
  }

  async listListings(
    context: TenantContext,
    input: { cursor?: string; take: number; status?: "DRAFT" | "PUBLISHED" | "PAUSED" | "AWARDED" | "CLOSED" | "CANCELLED"; query?: string },
  ) {
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        AND: [
          input.status ? { status: input.status } : { status: { not: "CANCELLED" } },
          {
            OR: [
              { organizationId: context.organizationId },
              { status: "PUBLISHED", visibility: "PUBLIC" },
            ],
          },
          input.query
            ? { OR: [{ title: { contains: input.query, mode: "insensitive" } }, { description: { contains: input.query, mode: "insensitive" } }] }
            : {},
        ],
      },
      include: { organization: { select: { id: true, name: true, slug: true } }, skills: { include: { skill: true } }, _count: { select: { proposals: true } } },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return { items: rows, nextCursor: nextCursor(rows, input.take) };
  }

  async createListing(context: TenantContext, input: {
    title: string; description: string; engagementType: "FIXED_PRICE" | "HOURLY" | "RETAINER" | "EMPLOYMENT";
    experienceLevel: "ENTRY" | "INTERMEDIATE" | "EXPERT"; budgetMinMinor?: bigint; budgetMaxMinor?: bigint;
    currency: string; visibility: "PUBLIC" | "PRIVATE" | "TALENT_POOL" | "INVITE_ONLY"; locationCountry?: string;
    remoteAllowed: boolean; applicationDeadline?: Date; workspaceProjectId?: string; publish: boolean; skillIds: string[];
  }) {
    if (input.workspaceProjectId) await projectInTenant(context.organizationId, input.workspaceProjectId);
    return withTransaction(async (tx) => {
      const listing = await tx.marketplaceListing.create({
        data: {
          organizationId: context.organizationId,
          postedById: context.userId,
          title: input.title,
          description: input.description,
          engagementType: input.engagementType,
          experienceLevel: input.experienceLevel,
          budgetMinMinor: input.budgetMinMinor,
          budgetMaxMinor: input.budgetMaxMinor,
          currency: input.currency,
          visibility: input.visibility,
          locationCountry: input.locationCountry,
          remoteAllowed: input.remoteAllowed,
          applicationDeadline: input.applicationDeadline,
          workspaceProjectId: input.workspaceProjectId,
          status: input.publish ? "PUBLISHED" : "DRAFT",
          publishedAt: input.publish ? new Date() : null,
          skills: { createMany: { data: input.skillIds.map((skillId) => ({ skillId })) } },
        },
        include: { skills: { include: { skill: true } } },
      });
      await event(tx, context, "marketplace.listing.created", "MarketplaceListing", listing.id, { status: listing.status });
      return listing;
    });
  }

  async listProposals(context: TenantContext, listingId?: string) {
    return prisma.proposal.findMany({
      where: listingId
        ? { listingId, listing: { organizationId: context.organizationId } }
        : { submittedById: context.userId, providerOrganizationId: context.organizationId },
      include: {
        listing: { select: { id: true, title: true, organizationId: true, status: true, version: true } },
        freelancerProfile: { select: { headline: true, userId: true } },
        submittedBy: { select: { id: true, displayName: true } },
        revisions: { orderBy: { revision: "desc" }, take: 5 },
        contract: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async submitProposal(context: TenantContext, input: {
    listingId: string; coverLetter: string; bidMinor: bigint; currency: string; estimatedDays?: number;
    submit: boolean; metadata?: Record<string, unknown>;
  }) {
    const [listing, profile] = await Promise.all([
      prisma.marketplaceListing.findFirst({ where: { id: input.listingId, status: "PUBLISHED", OR: [{ visibility: "PUBLIC" }, { organizationId: context.organizationId }] } }),
      prisma.freelancerProfile.findUnique({ where: { userId: context.userId } }),
    ]);
    if (!listing) throw new AppError("NOT_FOUND", "Marketplace listing not found or unavailable.", 404);
    if (listing.organizationId === context.organizationId) throw new AppError("CONFLICT", "A listing owner cannot submit a proposal to its own listing.", 409);
    if (!profile) throw new AppError("CONFLICT", "Create a freelancer profile before submitting a proposal.", 409);
    return withTransaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          listingId: listing.id,
          freelancerProfileId: profile.id,
          submittedById: context.userId,
          providerOrganizationId: context.organizationId,
          coverLetter: input.coverLetter,
          bidMinor: input.bidMinor,
          currency: input.currency,
          estimatedDays: input.estimatedDays,
          status: input.submit ? "SUBMITTED" : "DRAFT",
          submittedAt: input.submit ? new Date() : null,
          metadata: input.metadata ? json(input.metadata) : undefined,
          revisions: { create: { createdById: context.userId, revision: 1, coverLetter: input.coverLetter, bidMinor: input.bidMinor, currency: input.currency, estimatedDays: input.estimatedDays } },
        },
      });
      await event(tx, { ...context, organizationId: listing.organizationId }, "marketplace.proposal.submitted", "Proposal", proposal.id, { listingId: listing.id });
      return proposal;
    });
  }

  async decideProposal(
    context: TenantContext,
    proposalId: string,
    input: {
      status: "SHORTLISTED" | "REJECTED" | "WITHDRAWN";
      expectedVersion: number;
      note?: string;
    },
  ) {
    await requirePermission(
      context,
      input.status === "WITHDRAWN"
        ? "marketplace.proposal.manage"
        : "marketplace.proposal.review",
    );
    const proposal = await prisma.proposal.findFirst({
      where: {
        id: proposalId,
        ...(input.status === "WITHDRAWN"
          ? { submittedById: context.userId }
          : { listing: { organizationId: context.organizationId } }),
      },
      include: { listing: { select: { id: true, organizationId: true, status: true } } },
    });
    if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found.", 404);
    if (proposal.listing.status !== "PUBLISHED") {
      throw new AppError("CONFLICT", "The listing is no longer accepting proposal decisions.", 409);
    }
    const allowed = input.status === "WITHDRAWN"
      ? ["DRAFT", "SUBMITTED", "SHORTLISTED", "REVISION_REQUESTED"]
      : input.status === "SHORTLISTED"
        ? ["SUBMITTED"]
        : ["SUBMITTED", "SHORTLISTED", "REVISION_REQUESTED"];
    if (!allowed.includes(proposal.status)) {
      throw new AppError(
        "CONFLICT",
        `Proposal cannot move from ${proposal.status} to ${input.status}.`,
        409,
      );
    }

    return prisma.$transaction(async (tx) => {
      const changed = await tx.proposal.updateMany({
        where: {
          id: proposal.id,
          version: input.expectedVersion,
          status: { in: allowed as Prisma.EnumProposalStatusFilter["in"] },
        },
        data: {
          status: input.status,
          decidedAt: new Date(),
          decidedById: context.userId,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new AppError("CONFLICT", "Proposal changed before this decision was applied.", 409);
      }
      await audit(tx, context, `marketplace.proposal.${input.status.toLowerCase()}`, "Proposal", proposal.id, {
        listingId: proposal.listingId,
        previousStatus: proposal.status,
        note: input.note,
      });
      await event(tx, { ...context, organizationId: proposal.listing.organizationId }, "marketplace.proposal.decided", "Proposal", proposal.id, {
        listingId: proposal.listingId,
        status: input.status,
      });
      return tx.proposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: { listing: { select: { id: true, title: true, status: true, version: true } }, contract: true },
      });
    });
  }

  async awardProposal(context: TenantContext, proposalId: string, input: {
    idempotencyKey: string;
    expectedListingVersion: number;
    expectedProposalVersion: number;
    projectId?: string;
    title: string;
    taxRateBasisPoints: number;
    platformFeeBasisPoints: number;
    terms: Record<string, unknown>;
    startsAt?: Date;
    endsAt?: Date;
  }) {
    await requirePermission(context, "marketplace.proposal.review");
    await requirePermission(context, "marketplace.contract.manage");
    if (input.projectId) await projectInTenant(context.organizationId, input.projectId);
    const requestHash = createHash("sha256").update(stable({ proposalId, ...input })).digest("hex");

    try {
      return await prisma.$transaction(async (tx) => {
        const prior = await tx.idempotencyRecord.findUnique({
          where: {
            organizationId_scope_key: {
              organizationId: context.organizationId,
              scope: "marketplace.proposal.award",
              key: input.idempotencyKey,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== requestHash) {
            throw new AppError("CONFLICT", "The idempotency key was already used for another award.", 409);
          }
          const priorContractId = (prior.responseBody as { contractId?: string } | null)?.contractId;
          if (!priorContractId) throw new AppError("CONFLICT", "The prior award has not completed.", 409);
          return tx.contract.findUniqueOrThrow({
            where: { id: priorContractId },
            include: { proposal: true, listing: true, acceptances: true, milestones: true },
          });
        }

        await tx.idempotencyRecord.create({
          data: {
            organizationId: context.organizationId,
            userId: context.userId,
            scope: "marketplace.proposal.award",
            key: input.idempotencyKey,
            requestHash,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const proposal = await tx.proposal.findFirst({
          where: { id: proposalId, listing: { organizationId: context.organizationId } },
          include: {
            listing: true,
            submittedBy: {
              select: {
                memberships: {
                  where: { status: "ACTIVE" },
                  select: { organizationId: true },
                },
              },
            },
          },
        });
        if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found.", 404);
        if (!proposal.providerOrganizationId || !proposal.submittedBy.memberships.some((membership) => membership.organizationId === proposal.providerOrganizationId)) {
          throw new AppError("CONFLICT", "The provider no longer has an active membership in the proposing organization.", 409);
        }
        if (!["SUBMITTED", "SHORTLISTED"].includes(proposal.status)) {
          throw new AppError("CONFLICT", "Only submitted or shortlisted proposals can be awarded.", 409);
        }
        if (proposal.listing.status !== "PUBLISHED") {
          throw new AppError("CONFLICT", "This marketplace listing has already been awarded or closed.", 409);
        }

        const listingChanged = await tx.marketplaceListing.updateMany({
          where: {
            id: proposal.listingId,
            organizationId: context.organizationId,
            status: "PUBLISHED",
            version: input.expectedListingVersion,
          },
          data: { status: "AWARDED", awardedAt: new Date(), version: { increment: 1 } },
        });
        const proposalChanged = await tx.proposal.updateMany({
          where: {
            id: proposal.id,
            status: { in: ["SUBMITTED", "SHORTLISTED"] },
            version: input.expectedProposalVersion,
          },
          data: {
            status: "ACCEPTED",
            decidedAt: new Date(),
            decidedById: context.userId,
            version: { increment: 1 },
          },
        });
        if (listingChanged.count !== 1 || proposalChanged.count !== 1) {
          throw new AppError("CONFLICT", "Listing or proposal changed before the award was applied.", 409);
        }

        const contract = await tx.contract.create({
          data: {
            organizationId: context.organizationId,
            providerOrganizationId: proposal.providerOrganizationId,
            providerUserId: proposal.submittedById,
            listingId: proposal.listingId,
            proposalId: proposal.id,
            projectId: input.projectId ?? proposal.listing.workspaceProjectId,
            createdById: context.userId,
            title: input.title,
            status: "PENDING_SIGNATURES",
            valueMinor: proposal.bidMinor,
            currency: proposal.currency,
            taxRateBasisPoints: input.taxRateBasisPoints,
            platformFeeBasisPoints: input.platformFeeBasisPoints,
            terms: json(input.terms),
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          include: { proposal: true, listing: true, acceptances: true, milestones: true },
        });

        await tx.proposal.updateMany({
          where: {
            listingId: proposal.listingId,
            id: { not: proposal.id },
            status: { in: ["SUBMITTED", "SHORTLISTED", "REVISION_REQUESTED"] },
          },
          data: { status: "REJECTED", decidedAt: new Date(), decidedById: context.userId, version: { increment: 1 } },
        });
        await audit(tx, context, "marketplace.proposal.awarded", "Proposal", proposal.id, {
          listingId: proposal.listingId,
          contractId: contract.id,
          idempotencyKey: input.idempotencyKey,
        });
        await event(tx, context, "marketplace.listing.awarded", "MarketplaceListing", proposal.listingId, {
          proposalId: proposal.id,
          contractId: contract.id,
        }, contract.projectId ?? undefined);
        await tx.idempotencyRecord.update({
          where: {
            organizationId_scope_key: {
              organizationId: context.organizationId,
              scope: "marketplace.proposal.award",
              key: input.idempotencyKey,
            },
          },
          data: { responseStatus: 201, responseBody: json({ contractId: contract.id }) },
        });
        return contract;
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (isConcurrencyConflict(error)) {
        throw new AppError("CONFLICT", "This listing was awarded by another request.", 409);
      }
      throw error;
    }
  }
}

export class ContractService {
  async list(context: TenantContext) {
    const contracts = await prisma.contract.findMany({
      where: { OR: [{ organizationId: context.organizationId }, { providerOrganizationId: context.organizationId }, { providerUserId: context.userId }] },
      include: { milestones: true, proposal: { select: { id: true, status: true } }, project: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return contracts.map((contract) => ({
      ...contract,
      viewerParty: contract.organizationId === context.organizationId ? "CLIENT" as const : "PROVIDER" as const,
    }));
  }

  async create(context: TenantContext, input: {
    proposalId?: string; listingId?: string; projectId?: string; providerOrganizationId?: string; providerUserId?: string;
    title: string; valueMinor: bigint; currency: string; taxRateBasisPoints: number; platformFeeBasisPoints: number;
    terms: Record<string, unknown>; startsAt?: Date; endsAt?: Date;
  }) {
    if (input.proposalId) {
      throw new AppError(
        "CONFLICT",
        "Proposal-backed contracts must be created through the atomic award endpoint.",
        409,
      );
    }
    if (input.projectId) await projectInTenant(context.organizationId, input.projectId);
    const providerUserId = input.providerUserId;
    const listingId = input.listingId;
    if (listingId) {
      const listing = await prisma.marketplaceListing.findFirst({
        where: { id: listingId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!listing) throw new AppError("NOT_FOUND", "Marketplace listing not found.", 404);
    }
    return withTransaction(async (tx) => {
      const contract = await tx.contract.create({
        data: { ...input, listingId, providerUserId, organizationId: context.organizationId, createdById: context.userId, terms: json(input.terms) },
      });
      await event(tx, context, "contract.created", "Contract", contract.id, { status: contract.status }, input.projectId);
      return contract;
    });
  }
}

export class DeliveryService {
  async summary(context: TenantContext, projectId: string) {
    await projectInTenant(context.organizationId, projectId);
    const [timeEntries, risks, deliverables, changes] = await Promise.all([
      prisma.timeEntry.findMany({ where: { projectId }, orderBy: { startedAt: "desc" }, take: 100 }),
      prisma.projectRisk.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.deliverable.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.changeRequest.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    ]);
    return { timeEntries, risks, deliverables, changeRequests: changes };
  }

  async create(context: TenantContext, projectId: string, input: Record<string, unknown> & { type: string }) {
    await projectInTenant(context.organizationId, projectId);
    return withTransaction(async (tx) => {
      let row: { id: string };
      if (input.type === "timeEntry") {
        row = await tx.timeEntry.create({ data: { projectId, userId: context.userId, taskId: input.taskId as string | undefined, startedAt: input.startedAt as Date, endedAt: input.endedAt as Date | undefined, durationMinutes: input.durationMinutes as number | undefined, description: input.description as string | undefined, billable: input.billable as boolean } });
      } else if (input.type === "risk") {
        row = await tx.projectRisk.create({ data: { projectId, ownerId: context.userId, title: input.title as string, description: input.description as string | undefined, severity: input.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", probability: input.probability as number, impact: input.impact as number, mitigation: input.mitigation as string | undefined, dueAt: input.dueAt as Date | undefined } });
      } else if (input.type === "deliverable") {
        row = await tx.deliverable.create({ data: { projectId, createdById: context.userId, taskId: input.taskId as string | undefined, title: input.title as string, description: input.description as string | undefined, dueAt: input.dueAt as Date | undefined } });
      } else {
        row = await tx.changeRequest.create({ data: { projectId, requestedById: context.userId, title: input.title as string, description: input.description as string, impact: input.impact ? json(input.impact) : undefined } });
      }
      await event(tx, context, `workspace.${input.type}.created`, input.type, row.id, { projectId }, projectId);
      return row;
    });
  }
}

export class EnterpriseFileService {
  async list(context: TenantContext, input: { cursor?: string; take: number; projectId?: string; parentId?: string | null }) {
    if (input.projectId) await projectInTenant(context.organizationId, input.projectId);
    const rows = await prisma.fileNode.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) },
      include: { versions: { orderBy: { version: "desc" }, take: 1 }, lock: true, _count: { select: { children: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return { items: rows, nextCursor: nextCursor(rows, input.take) };
  }

  async createFolder(context: TenantContext, input: { name: string; parentId?: string; projectId?: string }) {
    if (input.projectId) await projectInTenant(context.organizationId, input.projectId);
    if (input.parentId) {
      const parent = await prisma.fileNode.findFirst({ where: { id: input.parentId, organizationId: context.organizationId, type: "FOLDER", deletedAt: null } });
      if (!parent) throw new AppError("NOT_FOUND", "Parent folder not found.", 404);
    }
    return prisma.fileNode.create({ data: { organizationId: context.organizationId, createdById: context.userId, type: "FOLDER", name: input.name, parentId: input.parentId, projectId: input.projectId } });
  }

  async createUploadIntent(context: TenantContext, input: { name: string; parentId?: string; projectId?: string; mimeType: string; sizeBytes: number; checksumSha256: string }) {
    if (input.projectId) await projectInTenant(context.organizationId, input.projectId);
    if (input.parentId) {
      const parent = await prisma.fileNode.findFirst({ where: { id: input.parentId, organizationId: context.organizationId, type: "FOLDER", deletedAt: null } });
      if (!parent) throw new AppError("NOT_FOUND", "Parent folder not found.", 404);
    }
    const storageKey = `${context.organizationId}/${new Date().toISOString().slice(0, 10)}/${randomBytes(18).toString("hex")}`;
    return withTransaction(async (tx) => {
      const node = await tx.fileNode.create({ data: { organizationId: context.organizationId, createdById: context.userId, type: "FILE", name: input.name, parentId: input.parentId, projectId: input.projectId, currentVersionNumber: 1 } });
      const version = await tx.fileVersion.create({ data: { fileNodeId: node.id, uploadedById: context.userId, version: 1, storageProvider: storageProvider.key, storageKey, mimeType: input.mimeType, sizeBytes: BigInt(input.sizeBytes), checksumSha256: input.checksumSha256.toLowerCase() } });
      const signedOperation = await storageProvider.createUpload({ organizationId: context.organizationId, storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, checksumSha256: input.checksumSha256 });
      await tx.fileActivity.create({ data: { fileNodeId: node.id, actorUserId: context.userId, type: "CREATED", metadata: json({ versionId: version.id }) } });
      await event(tx, context, "file.created", "FileNode", node.id, { name: node.name, versionId: version.id }, input.projectId);
      return { file: node, version, upload: signedOperation };
    });
  }

  async download(context: TenantContext, fileId: string) {
    const node = await prisma.fileNode.findFirst({ where: { id: fileId, organizationId: context.organizationId, type: "FILE", deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const version = node?.versions[0];
    if (!node || !version) throw new AppError("NOT_FOUND", "File not found.", 404);
    if (version.scanStatus !== "CLEAN") throw new AppError("CONFLICT", "File download is blocked until malware scanning succeeds.", 409);
    return storageProvider.createDownload({ organizationId: context.organizationId, storageKey: version.storageKey, downloadName: node.name });
  }
}

export { AiGovernanceService as AiRunService } from "@/lib/services/ai-governance.service";

export class FinanceService {
  async listInvoices(context: TenantContext) {
    await requirePermission(context, "finance.read");
    const invoices = await prisma.invoice.findMany({
      where: { OR: [{ organizationId: context.organizationId }, { billToOrganizationId: context.organizationId }] },
      include: {
        lines: true,
        paymentSchedules: { include: { contractMilestone: true } },
        transactions: { include: { refunds: true, refundRecord: true }, orderBy: { createdAt: "desc" } },
        contract: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return invoices.map((invoice) => ({
      ...invoice,
      canManage: invoice.organizationId === context.organizationId,
    }));
  }

  async getInvoice(context: TenantContext, invoiceId: string) {
    await requirePermission(context, "finance.read");
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, OR: [{ organizationId: context.organizationId }, { billToOrganizationId: context.organizationId }] },
      include: {
        lines: true,
        paymentSchedules: { include: { contractMilestone: true } },
        transactions: { include: { refunds: true, refundRecord: true }, orderBy: { createdAt: "desc" } },
        contract: { select: { id: true, title: true, status: true } },
      },
    });
    if (!invoice) throw new AppError("NOT_FOUND", "Invoice not found.", 404);
    return { ...invoice, canManage: invoice.organizationId === context.organizationId };
  }

  async createInvoice(context: TenantContext, input: { number: string; contractId?: string; contractMilestoneId?: string; billToOrganizationId?: string; currency: string; dueAt?: Date; lines: Array<{ description: string; quantity: number; unitAmountMinor: bigint; taxRateBasisPoints: number; metadata?: Record<string, unknown> }> }) {
    await requirePermission(context, "finance.manage");
    let milestone: { id: string; contractId: string; status: string; amountMinor: bigint; currency: string } | null = null;
    let billToOrganizationId = input.billToOrganizationId;
    if (input.contractId) {
      const contract = await prisma.contract.findFirst({ where: { id: input.contractId, organizationId: context.organizationId } });
      if (!contract) throw new AppError("NOT_FOUND", "Contract not found.", 404);
      if (input.billToOrganizationId && input.billToOrganizationId !== contract.providerOrganizationId) {
        throw new AppError("FORBIDDEN", "The billed organization must be the contract provider organization.", 403);
      }
      billToOrganizationId = input.billToOrganizationId ?? contract.providerOrganizationId ?? undefined;
    } else if (input.billToOrganizationId && input.billToOrganizationId !== context.organizationId) {
      throw new AppError("FORBIDDEN", "Standalone invoices cannot bill an unrelated organization.", 403);
    }
    if (input.contractMilestoneId) {
      milestone = await prisma.contractMilestone.findFirst({
        where: {
          id: input.contractMilestoneId,
          ...(input.contractId ? { contractId: input.contractId } : {}),
          contract: { organizationId: context.organizationId },
        },
        select: { id: true, contractId: true, status: true, amountMinor: true, currency: true },
      });
      if (!milestone) throw new AppError("NOT_FOUND", "Contract milestone not found.", 404);
      if (milestone.status !== "ACCEPTED") throw new AppError("CONFLICT", "Only an accepted milestone can be invoiced.", 409);
    }
    const computed = input.lines.map((line) => {
      const subtotal = line.unitAmountMinor * BigInt(line.quantity);
      const tax = subtotal * BigInt(line.taxRateBasisPoints) / BigInt(10_000);
      return { ...line, totalMinor: subtotal + tax, taxMinor: tax };
    });
    const subtotalMinor = computed.reduce((sum, line) => sum + line.unitAmountMinor * BigInt(line.quantity), BigInt(0));
    const taxMinor = computed.reduce((sum, line) => sum + line.taxMinor, BigInt(0));
    const totalMinor = subtotalMinor + taxMinor;
    if (totalMinor <= BigInt(0)) throw new AppError("VALIDATION_ERROR", "Invoice total must be greater than zero.", 422);
    if (milestone && (milestone.currency !== input.currency || milestone.amountMinor !== totalMinor)) {
      throw new AppError("CONFLICT", "Invoice total and currency must match the accepted milestone.", 409);
    }
    try {
      return await prisma.$transaction(async (tx) => {
        if (milestone && await tx.paymentSchedule.findFirst({ where: { contractMilestoneId: milestone.id }, select: { id: true } })) {
          throw new AppError("CONFLICT", "The accepted milestone already has an invoice schedule.", 409);
        }
        const invoice = await tx.invoice.create({
        data: {
          organizationId: context.organizationId,
          issuedById: context.userId,
          number: input.number,
          contractId: input.contractId ?? milestone?.contractId,
          billToOrganizationId,
          currency: input.currency,
          dueAt: input.dueAt,
          subtotalMinor,
          taxMinor,
          totalMinor,
          lines: { create: computed.map((line) => ({ description: line.description, quantity: line.quantity, unitAmountMinor: line.unitAmountMinor, taxRateBasisPoints: line.taxRateBasisPoints, totalMinor: line.totalMinor, metadata: line.metadata ? json(line.metadata) : undefined })) },
          ...(milestone ? { paymentSchedules: { create: { contractMilestoneId: milestone.id, dueAt: input.dueAt ?? new Date(Date.now() + 14 * 86_400_000), amountMinor: totalMinor, currency: input.currency, status: "ACCEPTED" } } } : {}),
        },
        include: { lines: true, paymentSchedules: true, transactions: true },
      });
        await audit(tx, context, "finance.invoice.created", "Invoice", invoice.id, { number: invoice.number, contractId: invoice.contractId, totalMinor: invoice.totalMinor.toString() });
        await event(tx, context, "finance.invoice.created", "Invoice", invoice.id, { status: invoice.status, number: invoice.number, totalMinor: invoice.totalMinor.toString() });
        return invoice;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && milestone) {
        throw new AppError("CONFLICT", "The accepted milestone already has an invoice schedule.", 409);
      }
      throw error;
    }
  }

  async transitionInvoice(context: TenantContext, invoiceId: string, input: { action: "ISSUE" | "MARK_OVERDUE" | "VOID"; expectedVersion: number; dueAt?: Date; reason?: string }) {
    await requirePermission(context, "finance.manage");
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: context.organizationId }, include: { transactions: true } });
    if (!invoice) throw new AppError("NOT_FOUND", "Invoice not found.", 404);
    const now = new Date();
    let status: "ISSUED" | "OVERDUE" | "VOID";
    const data: Prisma.InvoiceUpdateManyMutationInput = { version: { increment: 1 } };
    if (input.action === "ISSUE") {
      if (invoice.status !== "DRAFT") throw new AppError("CONFLICT", "Only a draft invoice can be issued.", 409);
      const dueAt = input.dueAt ?? invoice.dueAt;
      if (!dueAt) throw new AppError("VALIDATION_ERROR", "An invoice due date is required before issue.", 422);
      status = "ISSUED";
      Object.assign(data, { status, issuedAt: now, dueAt });
    } else if (input.action === "MARK_OVERDUE") {
      if (!["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) || !invoice.dueAt || invoice.dueAt >= now) {
        throw new AppError("CONFLICT", "Only a past-due issued invoice can be marked overdue.", 409);
      }
      status = "OVERDUE";
      Object.assign(data, { status });
    } else {
      if (!["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status)) throw new AppError("CONFLICT", "Invoice cannot be voided in its current state.", 409);
      if (invoice.transactions.some((transaction) => transaction.type === "CHARGE" && transaction.status === "SUCCEEDED")) throw new AppError("CONFLICT", "A paid invoice cannot be voided; issue a refund instead.", 409);
      status = "VOID";
      Object.assign(data, { status, voidedAt: now });
    }
    return prisma.$transaction(async (tx) => {
      const changed = await tx.invoice.updateMany({ where: { id: invoice.id, organizationId: context.organizationId, status: invoice.status, version: input.expectedVersion }, data });
      if (changed.count !== 1) throw new AppError("CONFLICT", "Invoice changed before the transition was applied.", 409);
      await audit(tx, context, `finance.invoice.${status.toLowerCase()}`, "Invoice", invoice.id, { previousStatus: invoice.status, reason: input.reason });
      await event(tx, context, "finance.invoice.status.changed", "Invoice", invoice.id, { previousStatus: invoice.status, status });
      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true, paymentSchedules: true, transactions: { include: { refunds: true } } } });
    });
  }

  async chargeInvoice(context: TenantContext, invoiceId: string, idempotencyKey: string) {
    await requirePermission(context, "finance.manage");
    const prior = await prisma.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey } } });
    if (prior) {
      if (prior.invoiceId !== invoiceId || prior.type !== "CHARGE") throw new AppError("CONFLICT", "The idempotency key was already used for another payment.", 409);
      return prior;
    }

    let reserved: { transaction: { id: string; amountMinor: bigint; currency: string }; invoice: { id: string; contractId: string | null } };
    try {
      reserved = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: context.organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, include: { transactions: true } });
        if (!invoice) throw new AppError("NOT_FOUND", "Payable invoice not found.", 404);
        const committed = invoice.transactions.filter((transaction) => transaction.type === "CHARGE" && ["PENDING", "PROCESSING", "SUCCEEDED"].includes(transaction.status)).reduce((sum, transaction) => sum + transaction.amountMinor, BigInt(0));
        const outstanding = invoice.totalMinor - committed;
        if (outstanding <= BigInt(0)) throw new AppError("CONFLICT", "The invoice has no unreserved payable balance.", 409);
        const locked = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version, status: invoice.status }, data: { version: { increment: 1 } } });
        if (locked.count !== 1) throw new AppError("CONFLICT", "Invoice changed while the charge was reserved.", 409);
        const transaction = await tx.financialTransaction.create({ data: { organizationId: context.organizationId, contractId: invoice.contractId, invoiceId: invoice.id, type: "CHARGE", status: "PENDING", amountMinor: outstanding, currency: invoice.currency, idempotencyKey, providerKey: paymentProvider.key } });
        await audit(tx, context, "finance.charge.requested", "FinancialTransaction", transaction.id, { invoiceId: invoice.id, amountMinor: outstanding.toString(), idempotencyKey });
        return { transaction, invoice: { id: invoice.id, contractId: invoice.contractId } };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (isConcurrencyConflict(error)) {
        const concurrent = await prisma.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey } } });
        if (concurrent) return concurrent;
        throw new AppError("CONFLICT", "A concurrent charge already reserved this invoice.", 409);
      }
      throw error;
    }

    try {
      const operation = await paymentProvider.createCharge({ organizationId: context.organizationId, amountMinor: reserved.transaction.amountMinor.toString(), currency: reserved.transaction.currency, idempotencyKey, metadata: { invoiceId: invoiceId, transactionId: reserved.transaction.id } });
      await prisma.financialTransaction.update({ where: { id: reserved.transaction.id }, data: { status: "PROCESSING", providerKey: paymentProvider.key, providerRef: operation.providerReference, metadata: json({ provider: operation.raw }), version: { increment: 1 } } });
      if (operation.status === "SUCCEEDED") await this.settleCharge(reserved.transaction.id, reserved.transaction.amountMinor, "synchronous");
      return prisma.financialTransaction.findUniqueOrThrow({ where: { id: reserved.transaction.id }, include: { refunds: true } });
    } catch (error) {
      await prisma.financialTransaction.updateMany({ where: { id: reserved.transaction.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureCode: error instanceof AppError ? error.code : "PROVIDER_ERROR", failureMessage: error instanceof Error ? error.message.slice(0, 2000) : "Payment provider failed.", processedAt: new Date(), version: { increment: 1 } } });
      throw error;
    }
  }

  async listRefunds(context: TenantContext) {
    await requirePermission(context, "finance.read");
    return prisma.refund.findMany({ where: { organizationId: context.organizationId }, include: { transaction: true, refundTransaction: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async createRefund(context: TenantContext, input: { transactionId: string; amountMinor: bigint; reason: string; idempotencyKey: string }) {
    await requirePermission(context, "finance.manage");
    const prior = await prisma.refund.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey: input.idempotencyKey } }, include: { refundTransaction: true } });
    if (prior) {
      if (prior.transactionId !== input.transactionId || prior.amountMinor !== input.amountMinor) throw new AppError("CONFLICT", "The idempotency key was already used for another refund.", 409);
      return prior;
    }
    const transactionKey = `refund:${input.idempotencyKey}`;
    let reservation: {
      refundId: string;
      refundTransactionId: string;
      originalId: string;
      originalProviderReference: string;
      amountMinor: bigint;
      currency: string;
    };
    try {
      reservation = await prisma.$transaction(async (tx) => {
        const original = await tx.financialTransaction.findFirst({ where: { id: input.transactionId, organizationId: context.organizationId, type: "CHARGE", status: "SUCCEEDED" }, include: { refunds: true } });
        if (!original?.providerRef) throw new AppError("NOT_FOUND", "A settled provider charge is required for refund.", 404);
        const reservedAmount = original.refunds.filter((refund) => ["REQUESTED", "APPROVED", "PROCESSING", "COMPLETED"].includes(refund.status)).reduce((sum, refund) => sum + refund.amountMinor, BigInt(0));
        if (input.amountMinor > original.amountMinor - reservedAmount) throw new AppError("CONFLICT", "Refund exceeds the remaining refundable balance.", 409);
        const locked = await tx.financialTransaction.updateMany({ where: { id: original.id, version: original.version, status: "SUCCEEDED" }, data: { version: { increment: 1 } } });
        if (locked.count !== 1) throw new AppError("CONFLICT", "The refundable balance changed before it could be reserved.", 409);
        const refundTransaction = await tx.financialTransaction.create({ data: { organizationId: context.organizationId, contractId: original.contractId, invoiceId: original.invoiceId, type: "REFUND", status: "PENDING", amountMinor: input.amountMinor, currency: original.currency, idempotencyKey: transactionKey, providerKey: paymentProvider.key } });
        const refund = await tx.refund.create({ data: { organizationId: context.organizationId, transactionId: original.id, refundTransactionId: refundTransaction.id, requestedById: context.userId, idempotencyKey: input.idempotencyKey, status: "PROCESSING", amountMinor: input.amountMinor, reason: input.reason } });
        await audit(tx, context, "finance.refund.requested", "Refund", refund.id, { transactionId: original.id, amountMinor: input.amountMinor.toString(), idempotencyKey: input.idempotencyKey });
        return { refundId: refund.id, refundTransactionId: refundTransaction.id, originalId: original.id, originalProviderReference: original.providerRef, amountMinor: input.amountMinor, currency: original.currency };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (isConcurrencyConflict(error)) {
        const concurrent = await prisma.refund.findUnique({ where: { organizationId_idempotencyKey: { organizationId: context.organizationId, idempotencyKey: input.idempotencyKey } }, include: { refundTransaction: true } });
        if (concurrent) return concurrent;
        throw new AppError("CONFLICT", "A concurrent refund changed the remaining refundable balance.", 409);
      }
      throw error;
    }

    try {
      const operation = await paymentProvider.createRefund({ organizationId: context.organizationId, originalProviderReference: reservation.originalProviderReference, amountMinor: reservation.amountMinor.toString(), currency: reservation.currency, idempotencyKey: input.idempotencyKey, metadata: { originalTransactionId: reservation.originalId, refundId: reservation.refundId, refundTransactionId: reservation.refundTransactionId } });
      await prisma.$transaction([
        prisma.refund.update({ where: { id: reservation.refundId }, data: { providerRef: operation.providerReference, status: "PROCESSING", version: { increment: 1 } } }),
        prisma.financialTransaction.update({ where: { id: reservation.refundTransactionId }, data: { providerRef: operation.providerReference, status: "PROCESSING", metadata: json({ provider: operation.raw }), version: { increment: 1 } } }),
      ]);
      if (operation.status === "SUCCEEDED") await this.settleRefund(reservation.refundId, input.amountMinor, "synchronous");
      return prisma.refund.findUniqueOrThrow({ where: { id: reservation.refundId }, include: { transaction: true, refundTransaction: true } });
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message.slice(0, 2000) : "Refund provider failed.";
      await prisma.$transaction([
        prisma.refund.updateMany({ where: { id: reservation.refundId, status: "PROCESSING" }, data: { status: "FAILED", processedAt: new Date(), version: { increment: 1 } } }),
        prisma.financialTransaction.updateMany({ where: { id: reservation.refundTransactionId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureCode: error instanceof AppError ? error.code : "PROVIDER_ERROR", failureMessage, processedAt: new Date(), version: { increment: 1 } } }),
      ]);
      throw error;
    }
  }

  async acceptWebhook(providerKey: string, eventId: string, rawBody: string, signature: string) {
    if (providerKey !== paymentProvider.key || !paymentProvider.verifyWebhook(rawBody, signature)) throw new AppError("UNAUTHORIZED", "Webhook signature is invalid.", 401);
    let payload: ReturnType<typeof paymentWebhookSchema.parse>;
    try {
      payload = paymentWebhookSchema.parse(JSON.parse(rawBody));
    } catch (error) {
      if (error instanceof SyntaxError) throw new AppError("VALIDATION_ERROR", "Payment webhook payload is invalid JSON.", 422);
      throw error;
    }
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const existing = await prisma.webhookReceipt.findUnique({ where: { providerKey_eventId: { providerKey, eventId } } });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new AppError("CONFLICT", "Webhook event identifier was replayed with a different payload.", 409);
      if (existing.processingStatus === "PROCESSED") return existing;
    } else {
      await prisma.webhookReceipt.create({ data: { providerKey, eventId, eventType: payload.type, providerRef: payload.providerReference, organizationId: payload.organizationId, payloadHash, signatureVerified: true } });
    }

    try {
      if (payload.type.startsWith("charge.")) {
        const transaction = await prisma.financialTransaction.findFirst({ where: { providerKey, providerRef: payload.providerReference, type: "CHARGE" } });
        if (!transaction) throw new AppError("NOT_FOUND", "Webhook charge reference was not found.", 404);
        this.assertWebhookTransaction(payload, transaction);
        if (payload.type === "charge.succeeded") await this.settleCharge(transaction.id, payload.amountMinor, eventId);
        else await prisma.financialTransaction.updateMany({ where: { id: transaction.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureCode: payload.failureCode ?? "PROVIDER_DECLINED", failureMessage: payload.failureMessage, processedAt: payload.occurredAt ?? new Date(), version: { increment: 1 } } });
        return prisma.webhookReceipt.update({ where: { providerKey_eventId: { providerKey, eventId } }, data: { organizationId: transaction.organizationId, transactionId: transaction.id, processedAt: new Date(), processingStatus: "PROCESSED", failureReason: null } });
      }

      const refundTransaction = await prisma.financialTransaction.findFirst({ where: { providerKey, providerRef: payload.providerReference, type: "REFUND" }, include: { refundRecord: true } });
      const refund = refundTransaction?.refundRecord;
      if (!refundTransaction || !refund) throw new AppError("NOT_FOUND", "Webhook refund reference was not found.", 404);
      this.assertWebhookTransaction(payload, refundTransaction);
      if (payload.type === "refund.succeeded") await this.settleRefund(refund.id, payload.amountMinor, eventId);
      else await prisma.$transaction([
        prisma.refund.updateMany({ where: { id: refund.id, status: "PROCESSING" }, data: { status: "FAILED", processedAt: payload.occurredAt ?? new Date(), version: { increment: 1 } } }),
        prisma.financialTransaction.updateMany({ where: { id: refundTransaction.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureCode: payload.failureCode ?? "PROVIDER_DECLINED", failureMessage: payload.failureMessage, processedAt: payload.occurredAt ?? new Date(), version: { increment: 1 } } }),
      ]);
      return prisma.webhookReceipt.update({ where: { providerKey_eventId: { providerKey, eventId } }, data: { organizationId: refund.organizationId, transactionId: refundTransaction.id, refundId: refund.id, processedAt: new Date(), processingStatus: "PROCESSED", failureReason: null } });
    } catch (error) {
      await prisma.webhookReceipt.update({ where: { providerKey_eventId: { providerKey, eventId } }, data: { processingStatus: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 2000) : "Webhook processing failed." } });
      throw error;
    }
  }

  private assertWebhookTransaction(payload: ReturnType<typeof paymentWebhookSchema.parse>, transaction: { organizationId: string; amountMinor: bigint; currency: string }) {
    if (payload.organizationId && payload.organizationId !== transaction.organizationId) throw new AppError("FORBIDDEN", "Webhook organization does not match the transaction.", 403);
    if (payload.amountMinor !== transaction.amountMinor || payload.currency !== transaction.currency) throw new AppError("CONFLICT", "Webhook amount or currency does not match the transaction.", 409);
  }

  private async settleCharge(transactionId: string, actualMinor: bigint, evidence: string) {
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
      if (!transaction?.invoiceId) throw new AppError("NOT_FOUND", "Charge transaction is not linked to an invoice.", 404);
      if (transaction.status === "SUCCEEDED") return transaction;
      const changed = await tx.financialTransaction.updateMany({ where: { id: transaction.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "SUCCEEDED", processedAt: new Date(), failureCode: null, failureMessage: null, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError("CONFLICT", "Charge cannot be settled from its current state.", 409);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: transaction.invoiceId } });
      const charges = await tx.financialTransaction.aggregate({ where: { invoiceId: invoice.id, type: "CHARGE", status: "SUCCEEDED" }, _sum: { amountMinor: true } });
      const paidMinor = charges._sum.amountMinor ?? BigInt(0);
      const paid = paidMinor >= invoice.totalMinor;
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: paid ? "PAID" : "PARTIALLY_PAID", paidAt: paid ? new Date() : null, version: { increment: 1 } } });
      if (paid) {
        const schedules = await tx.paymentSchedule.findMany({ where: { invoiceId: invoice.id }, select: { contractMilestoneId: true } });
        await tx.paymentSchedule.updateMany({ where: { invoiceId: invoice.id }, data: { status: "RELEASED" } });
        const milestoneIds = schedules.flatMap((schedule) => schedule.contractMilestoneId ? [schedule.contractMilestoneId] : []);
        if (milestoneIds.length) await tx.contractMilestone.updateMany({ where: { id: { in: milestoneIds }, status: { in: ["ACCEPTED", "RELEASE_PENDING"] } }, data: { status: "RELEASED", releasedAt: new Date(), version: { increment: 1 } } });
      }
      await this.reconcile(tx, transaction.organizationId, transaction.providerKey ?? paymentProvider.key, transaction.amountMinor, actualMinor, transaction.currency, { evidence, transactionId: transaction.id, type: "charge.succeeded" });
      await tx.auditEvent.create({ data: { organizationId: transaction.organizationId, action: "finance.charge.settled", resourceType: "FinancialTransaction", resourceId: transaction.id, outcome: "SUCCESS", metadata: json({ invoiceId: invoice.id, evidence }) } });
      return tx.financialTransaction.findUniqueOrThrow({ where: { id: transaction.id } });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  private async settleRefund(refundId: string, actualMinor: bigint, evidence: string) {
    return prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { refundTransaction: true } });
      if (!refund?.refundTransaction) throw new AppError("NOT_FOUND", "Refund transaction was not found.", 404);
      if (refund.status === "COMPLETED" && refund.refundTransaction.status === "SUCCEEDED") return refund;
      const refundChanged = await tx.refund.updateMany({ where: { id: refund.id, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } }, data: { status: "COMPLETED", processedAt: new Date(), version: { increment: 1 } } });
      const transactionChanged = await tx.financialTransaction.updateMany({ where: { id: refund.refundTransaction.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "SUCCEEDED", processedAt: new Date(), failureCode: null, failureMessage: null, version: { increment: 1 } } });
      if (refundChanged.count !== 1 || transactionChanged.count !== 1) throw new AppError("CONFLICT", "Refund cannot be settled from its current state.", 409);
      await this.reconcile(tx, refund.organizationId, refund.refundTransaction.providerKey ?? paymentProvider.key, -refund.amountMinor, -actualMinor, refund.refundTransaction.currency, { evidence, refundId: refund.id, transactionId: refund.refundTransaction.id, type: "refund.succeeded" });
      await tx.auditEvent.create({ data: { organizationId: refund.organizationId, action: "finance.refund.settled", resourceType: "Refund", resourceId: refund.id, outcome: "SUCCESS", metadata: json({ evidence, amountMinor: refund.amountMinor.toString() }) } });
      return tx.refund.findUniqueOrThrow({ where: { id: refund.id }, include: { refundTransaction: true } });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 });
  }

  private async reconcile(tx: Prisma.TransactionClient, organizationId: string, providerKey: string, expectedMinor: bigint, actualMinor: bigint, currency: string, evidence: Record<string, unknown>) {
    const periodStart = new Date();
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart.getTime() + 86_400_000);
    const record = await tx.reconciliationRecord.upsert({
      where: { organizationId_providerKey_periodStart_periodEnd: { organizationId, providerKey, periodStart, periodEnd } },
      create: { organizationId, providerKey, periodStart, periodEnd, expectedMinor, actualMinor, differenceMinor: actualMinor - expectedMinor, currency, status: actualMinor === expectedMinor ? "MATCHED" : "MISMATCH", eventCount: 1, lastReconciledAt: new Date(), evidence: json(evidence) },
      update: { expectedMinor: { increment: expectedMinor }, actualMinor: { increment: actualMinor }, eventCount: { increment: 1 }, lastReconciledAt: new Date(), evidence: json(evidence) },
    });
    const differenceMinor = record.actualMinor - record.expectedMinor;
    if (record.differenceMinor !== differenceMinor || record.status !== (differenceMinor === BigInt(0) ? "MATCHED" : "MISMATCH")) {
      await tx.reconciliationRecord.update({ where: { id: record.id }, data: { differenceMinor, status: differenceMinor === BigInt(0) ? "MATCHED" : "MISMATCH" } });
    }
  }
}

export class PlatformQueryService {
  async search(context: TenantContext, input: { q: string; scope: string; take: number }) {
    const started = Date.now();
    const rows = await prisma.searchDocument.findMany({ where: { organizationId: context.organizationId, ...(input.scope !== "all" ? { entityType: input.scope } : {}), OR: [{ title: { contains: input.q, mode: "insensitive" } }, { body: { contains: input.q, mode: "insensitive" } }] }, orderBy: { indexedAt: "desc" }, take: input.take });
    await prisma.searchQueryLog.create({ data: { organizationId: context.organizationId, userId: context.userId, scope: input.scope, queryHash: createHash("sha256").update(input.q.toLocaleLowerCase()).digest("hex"), resultCount: rows.length, durationMs: Date.now() - started } });
    return rows;
  }

  async analytics(context: TenantContext, days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [metrics, activeProjects, openContracts, invoiceAggregate, aiAggregate] = await Promise.all([
      prisma.analyticsDailyMetric.findMany({ where: { organizationId: context.organizationId, date: { gte: since } }, orderBy: { date: "asc" } }),
      prisma.project.count({ where: { organizationId: context.organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.contract.count({ where: { organizationId: context.organizationId, status: "ACTIVE" } }),
      prisma.invoice.aggregate({ where: { organizationId: context.organizationId, status: { not: "VOID" } }, _sum: { totalMinor: true }, _count: true }),
      prisma.aiUsageRecord.aggregate({ where: { organizationId: context.organizationId, createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true, costMinor: true }, _count: true }),
    ]);
    return { windowDays: days, activeProjects, openContracts, invoices: invoiceAggregate, ai: aiAggregate, metrics };
  }

  async securityEvents(context: TenantContext) {
    return prisma.securityEvent.findMany({ where: { organizationId: context.organizationId }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async supportCases(context: TenantContext) {
    return prisma.supportCase.findMany({ where: { organizationId: context.organizationId }, orderBy: { updatedAt: "desc" }, take: 100 });
  }

  async createSupportCase(context: TenantContext, input: { subject: string; description: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" }) {
    const number = `SUP-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
    return prisma.supportCase.create({ data: { organizationId: context.organizationId, requesterId: context.userId, number, ...input } });
  }

  async requestExport(context: TenantContext, input: { type: string; filters?: Record<string, unknown> }) {
    return withTransaction(async (tx) => {
      const job = await tx.dataExportJob.create({ data: { organizationId: context.organizationId, requestedById: context.userId, type: input.type, filters: input.filters ? json(input.filters) : undefined } });
      await tx.backgroundJob.create({ data: { organizationId: context.organizationId, type: "DATA_EXPORT", payload: json({ exportJobId: job.id }) } });
      return job;
    });
  }
}
