import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { withPerformanceProfile } from "@/lib/services/platform-reliability.service";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function audit(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: unknown,
) {
  await tx.auditEvent.create({
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
  await tx.realtimeEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      topic: `organization:${context.organizationId}`,
      eventType: action,
      aggregateType: resourceType,
      aggregateId: resourceId,
      payload: json(metadata ?? {}),
    },
  });
}

async function membershipInTenant(
  organizationId: string,
  membershipId?: string,
) {
  if (!membershipId) return;
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The selected CRM owner is not an active organization member.",
      422,
    );
  }
}

function requireEntityTarget(input: {
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
  leadId?: string;
}) {
  if (
    !input.accountId &&
    !input.contactId &&
    !input.opportunityId &&
    !input.leadId
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A CRM activity or note must target an account, contact, opportunity, or lead.",
      422,
    );
  }
}

async function validateTargets(
  organizationId: string,
  input: {
    accountId?: string;
    contactId?: string;
    opportunityId?: string;
    leadId?: string;
  },
) {
  requireEntityTarget(input);
  const checks = await Promise.all([
    input.accountId
      ? prisma.crmAccount.findFirst({
          where: { id: input.accountId, organizationId },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
    input.contactId
      ? prisma.crmContact.findFirst({
          where: { id: input.contactId, organizationId },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
    input.opportunityId
      ? prisma.crmOpportunity.findFirst({
          where: { id: input.opportunityId, organizationId },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
    input.leadId
      ? prisma.crmLead.findFirst({
          where: { id: input.leadId, organizationId },
          select: { id: true },
        })
      : Promise.resolve({ id: "" }),
  ]);
  if (checks.some((result) => !result)) {
    throw new AppError("NOT_FOUND", "CRM target not found.", 404);
  }
}

export class EnterpriseCrmService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "crm.read");
    return withPerformanceProfile(
      {
        operation: "phase9.crm.dashboard",
        organizationId: context.organizationId,
      },
      async () => {
        const [
          pipelines,
          leads,
          accounts,
          opportunities,
          activities,
          quotes,
          health,
          leadCounts,
          opportunityCounts,
          opportunityValue,
        ] = await Promise.all([
          prisma.crmPipeline.findMany({
            where: { organizationId: context.organizationId, isActive: true },
            include: {
              stages: {
                include: { _count: { select: { opportunities: true } } },
                orderBy: { position: "asc" },
              },
            },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          }),
          prisma.crmLead.findMany({
            where: { organizationId: context.organizationId },
            include: {
              assignedTo: {
                include: { user: { select: { displayName: true, email: true } } },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
          }),
          prisma.crmAccount.findMany({
            where: { organizationId: context.organizationId },
            include: {
              owner: {
                include: { user: { select: { displayName: true, email: true } } },
              },
              contacts: {
                orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
                take: 5,
              },
              healthSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
              _count: {
                select: { contacts: true, opportunities: true, quotes: true },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
          }),
          prisma.crmOpportunity.findMany({
            where: { organizationId: context.organizationId },
            include: {
              account: { select: { id: true, name: true } },
              stage: true,
              pipeline: { select: { id: true, name: true } },
              owner: {
                include: { user: { select: { displayName: true, email: true } } },
              },
              quotes: { orderBy: { updatedAt: "desc" }, take: 3 },
            },
            orderBy: [{ expectedCloseAt: "asc" }, { updatedAt: "desc" }],
            take: 100,
          }),
          prisma.crmActivity.findMany({
            where: { organizationId: context.organizationId },
            include: {
              createdBy: { select: { displayName: true, email: true } },
              account: { select: { id: true, name: true } },
              opportunity: { select: { id: true, name: true } },
            },
            orderBy: { occurredAt: "desc" },
            take: 100,
          }),
          prisma.crmQuote.findMany({
            where: { organizationId: context.organizationId },
            include: {
              account: { select: { id: true, name: true } },
              opportunity: { select: { id: true, name: true } },
              lines: { orderBy: { position: "asc" } },
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
          }),
          prisma.crmCustomerHealthSnapshot.groupBy({
            by: ["band"],
            where: { organizationId: context.organizationId },
            _count: true,
          }),
          prisma.crmLead.groupBy({
            by: ["status"],
            where: { organizationId: context.organizationId },
            _count: true,
          }),
          prisma.crmOpportunity.groupBy({
            by: ["status"],
            where: { organizationId: context.organizationId },
            _count: true,
            _sum: { amountMinor: true },
          }),
          prisma.crmOpportunity.aggregate({
            where: {
              organizationId: context.organizationId,
              status: "OPEN",
            },
            _sum: { amountMinor: true },
            _count: true,
          }),
        ]);
        return {
          pipelines,
          leads,
          accounts,
          opportunities,
          activities,
          quotes,
          analytics: {
            leadCounts,
            opportunityCounts,
            openPipelineValueMinor:
              opportunityValue._sum.amountMinor ?? BigInt(0),
            openOpportunities: opportunityValue._count,
            health,
          },
        };
      },
    );
  }

  async customerTimeline(context: TenantContext, accountId: string) {
    await requirePermission(context, "crm.read");
    const account = await prisma.crmAccount.findFirst({
      where: { id: accountId, organizationId: context.organizationId },
      include: {
        contacts: true,
        opportunities: { include: { stage: true } },
        activities: {
          include: { createdBy: { select: { displayName: true, email: true } } },
          orderBy: { occurredAt: "desc" },
          take: 200,
        },
        notes: {
          include: { author: { select: { displayName: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        },
        quotes: { orderBy: { createdAt: "desc" }, take: 100 },
        healthSnapshots: { orderBy: { capturedAt: "desc" }, take: 100 },
        customerMetrics: { orderBy: { periodEnd: "desc" }, take: 100 },
      },
    });
    if (!account) throw new AppError("NOT_FOUND", "CRM account not found.", 404);
    const timeline = [
      ...account.activities.map((row) => ({
        id: row.id,
        type: "activity",
        at: row.occurredAt,
        title: row.subject,
        detail: row.details,
      })),
      ...account.notes.map((row) => ({
        id: row.id,
        type: "note",
        at: row.createdAt,
        title: row.isPinned ? "Pinned note" : "Note",
        detail: row.body,
      })),
      ...account.quotes.map((row) => ({
        id: row.id,
        type: "quote",
        at: row.createdAt,
        title: `${row.quoteNumber} · ${row.status}`,
        detail: row.totalMinor.toString(),
      })),
      ...account.healthSnapshots.map((row) => ({
        id: row.id,
        type: "health",
        at: row.capturedAt,
        title: `${row.band} · ${row.score}`,
        detail: row.source,
      })),
    ].sort((left, right) => right.at.getTime() - left.at.getTime());
    return { account, timeline };
  }

  async createPipeline(
    context: TenantContext,
    input: {
      name: string;
      description?: string;
      isDefault: boolean;
      stages: Array<{
        name: string;
        probability: number;
        category: "OPEN" | "WON" | "LOST";
      }>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const won = input.stages.filter((stage) => stage.category === "WON").length;
    const lost = input.stages.filter((stage) => stage.category === "LOST").length;
    if (won !== 1 || lost !== 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A CRM pipeline requires exactly one won stage and one lost stage.",
        422,
      );
    }
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.crmPipeline.updateMany({
          where: { organizationId: context.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const pipeline = await tx.crmPipeline.create({
        data: {
          organizationId: context.organizationId,
          name: input.name,
          description: input.description,
          isDefault: input.isDefault,
          stages: {
            create: input.stages.map((stage, position) => ({
              ...stage,
              position,
            })),
          },
        },
        include: { stages: { orderBy: { position: "asc" } } },
      });
      await audit(tx, context, "crm.pipeline.created", "CrmPipeline", pipeline.id);
      return pipeline;
    });
  }

  async createLead(
    context: TenantContext,
    input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      companyName?: string;
      jobTitle?: string;
      source?: string;
      score: number;
      assignedToMembershipId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await membershipInTenant(context.organizationId, input.assignedToMembershipId);
    return prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.create({
        data: {
          organizationId: context.organizationId,
          ...input,
          metadata: input.metadata ? json(input.metadata) : undefined,
        },
      });
      await audit(tx, context, "crm.lead.created", "CrmLead", lead.id, {
        source: lead.source,
      });
      return lead;
    });
  }

  async createAccount(
    context: TenantContext,
    input: {
      name: string;
      industry?: string;
      website?: string;
      phone?: string;
      countryCode: string;
      ownerMembershipId?: string;
      parentAccountId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await membershipInTenant(context.organizationId, input.ownerMembershipId);
    if (input.parentAccountId) {
      const parent = await prisma.crmAccount.findFirst({
        where: { id: input.parentAccountId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!parent) throw new AppError("NOT_FOUND", "Parent CRM account not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const account = await tx.crmAccount.create({
        data: {
          organizationId: context.organizationId,
          ...input,
          metadata: input.metadata ? json(input.metadata) : undefined,
        },
      });
      await audit(tx, context, "crm.account.created", "CrmAccount", account.id);
      return account;
    });
  }

  async createContact(
    context: TenantContext,
    input: {
      accountId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      ownerMembershipId?: string;
      isPrimary: boolean;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await membershipInTenant(context.organizationId, input.ownerMembershipId);
    const account = await prisma.crmAccount.findFirst({
      where: { id: input.accountId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!account) throw new AppError("NOT_FOUND", "CRM account not found.", 404);
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.crmContact.updateMany({
          where: {
            organizationId: context.organizationId,
            accountId: account.id,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      const contact = await tx.crmContact.create({
        data: {
          organizationId: context.organizationId,
          ...input,
          metadata: input.metadata ? json(input.metadata) : undefined,
        },
      });
      await audit(tx, context, "crm.contact.created", "CrmContact", contact.id, {
        accountId: account.id,
      });
      return contact;
    });
  }

  async createOpportunity(
    context: TenantContext,
    input: {
      accountId: string;
      primaryContactId?: string;
      pipelineId: string;
      stageId: string;
      ownerMembershipId?: string;
      name: string;
      amountMinor: number;
      currency: string;
      expectedCloseAt?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await membershipInTenant(context.organizationId, input.ownerMembershipId);
    const [account, pipeline, stage, contact] = await Promise.all([
      prisma.crmAccount.findFirst({
        where: { id: input.accountId, organizationId: context.organizationId },
        select: { id: true },
      }),
      prisma.crmPipeline.findFirst({
        where: { id: input.pipelineId, organizationId: context.organizationId, isActive: true },
        select: { id: true },
      }),
      prisma.crmPipelineStage.findFirst({
        where: { id: input.stageId, pipeline: { organizationId: context.organizationId } },
      }),
      input.primaryContactId
        ? prisma.crmContact.findFirst({
            where: {
              id: input.primaryContactId,
              organizationId: context.organizationId,
              accountId: input.accountId,
            },
            select: { id: true },
          })
        : Promise.resolve({ id: "" }),
    ]);
    if (!account || !pipeline || !stage || !contact) {
      throw new AppError("NOT_FOUND", "CRM opportunity relationship not found.", 404);
    }
    if (stage.pipelineId !== pipeline.id) {
      throw new AppError("VALIDATION_ERROR", "Stage does not belong to the selected pipeline.", 422);
    }
    const status =
      stage.category === "WON" ? "WON" : stage.category === "LOST" ? "LOST" : "OPEN";
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.crmOpportunity.create({
        data: {
          organizationId: context.organizationId,
          accountId: account.id,
          primaryContactId: input.primaryContactId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          ownerMembershipId: input.ownerMembershipId,
          name: input.name,
          status,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency.toUpperCase(),
          probability: stage.probability,
          expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : undefined,
          closedAt: status === "OPEN" ? undefined : new Date(),
          metadata: input.metadata ? json(input.metadata) : undefined,
        },
      });
      await audit(
        tx,
        context,
        "crm.opportunity.created",
        "CrmOpportunity",
        opportunity.id,
        { accountId: account.id, stageId: stage.id },
      );
      return opportunity;
    });
  }

  async convertLead(
    context: TenantContext,
    input: {
      leadId: string;
      accountName: string;
      opportunityName: string;
      pipelineId: string;
      stageId: string;
      amountMinor: number;
      currency: string;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const [lead, stage] = await Promise.all([
      prisma.crmLead.findFirst({
        where: { id: input.leadId, organizationId: context.organizationId },
      }),
      prisma.crmPipelineStage.findFirst({
        where: {
          id: input.stageId,
          pipelineId: input.pipelineId,
          pipeline: { organizationId: context.organizationId, isActive: true },
        },
      }),
    ]);
    if (!lead || !stage) throw new AppError("NOT_FOUND", "Lead or CRM stage not found.", 404);
    if (lead.status === "CONVERTED") {
      throw new AppError("CONFLICT", "The lead has already been converted.", 409);
    }
    return prisma.$transaction(async (tx) => {
      const account = await tx.crmAccount.upsert({
        where: {
          organizationId_name: {
            organizationId: context.organizationId,
            name: input.accountName,
          },
        },
        create: {
          organizationId: context.organizationId,
          name: input.accountName,
          status: "PROSPECT",
          ownerMembershipId: lead.assignedToMembershipId,
        },
        update: {},
      });
      const contact = await tx.crmContact.create({
        data: {
          organizationId: context.organizationId,
          accountId: account.id,
          ownerMembershipId: lead.assignedToMembershipId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          jobTitle: lead.jobTitle,
          isPrimary: true,
        },
      });
      const status =
        stage.category === "WON" ? "WON" : stage.category === "LOST" ? "LOST" : "OPEN";
      const opportunity = await tx.crmOpportunity.create({
        data: {
          organizationId: context.organizationId,
          accountId: account.id,
          primaryContactId: contact.id,
          pipelineId: input.pipelineId,
          stageId: stage.id,
          ownerMembershipId: lead.assignedToMembershipId,
          name: input.opportunityName,
          status,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency.toUpperCase(),
          probability: stage.probability,
          closedAt: status === "OPEN" ? undefined : new Date(),
        },
      });
      await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "CONVERTED",
          convertedAt: new Date(),
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedOpportunityId: opportunity.id,
        },
      });
      await audit(tx, context, "crm.lead.converted", "CrmLead", lead.id, {
        accountId: account.id,
        contactId: contact.id,
        opportunityId: opportunity.id,
      });
      return { leadId: lead.id, account, contact, opportunity };
    });
  }

  async advanceOpportunity(
    context: TenantContext,
    input: {
      opportunityId: string;
      stageId: string;
      expectedVersion: number;
      lostReason?: string;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const opportunity = await prisma.crmOpportunity.findFirst({
      where: { id: input.opportunityId, organizationId: context.organizationId },
    });
    if (!opportunity) throw new AppError("NOT_FOUND", "CRM opportunity not found.", 404);
    const stage = await prisma.crmPipelineStage.findFirst({
      where: { id: input.stageId, pipelineId: opportunity.pipelineId },
    });
    if (!stage) throw new AppError("NOT_FOUND", "CRM stage not found.", 404);
    const status =
      stage.category === "WON" ? "WON" : stage.category === "LOST" ? "LOST" : "OPEN";
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.crmOpportunity.updateMany({
        where: {
          id: opportunity.id,
          organizationId: context.organizationId,
          version: input.expectedVersion,
        },
        data: {
          stageId: stage.id,
          probability: stage.probability,
          status,
          lostReason: status === "LOST" ? input.lostReason : null,
          closedAt: status === "OPEN" ? null : new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new AppError("CONFLICT", "Opportunity changed before this stage update.", 409);
      }
      await audit(tx, context, "crm.opportunity.advanced", "CrmOpportunity", opportunity.id, {
        stageId: stage.id,
        status,
      });
      return tx.crmOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    });
    return changed;
  }

  async createActivity(
    context: TenantContext,
    input: {
      type: "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE" | "SYSTEM";
      subject: string;
      details?: string;
      accountId?: string;
      contactId?: string;
      opportunityId?: string;
      leadId?: string;
      dueAt?: string;
      occurredAt?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await validateTargets(context.organizationId, input);
    return prisma.$transaction(async (tx) => {
      const activity = await tx.crmActivity.create({
        data: {
          organizationId: context.organizationId,
          createdById: context.userId,
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          metadata: input.metadata ? json(input.metadata) : undefined,
        },
      });
      await audit(tx, context, "crm.activity.created", "CrmActivity", activity.id, {
        type: activity.type,
      });
      return activity;
    });
  }

  async createNote(
    context: TenantContext,
    input: {
      body: string;
      isPinned: boolean;
      accountId?: string;
      contactId?: string;
      opportunityId?: string;
      leadId?: string;
    },
  ) {
    await requirePermission(context, "crm.manage");
    await validateTargets(context.organizationId, input);
    return prisma.$transaction(async (tx) => {
      const note = await tx.crmNote.create({
        data: {
          organizationId: context.organizationId,
          authorId: context.userId,
          ...input,
        },
      });
      await audit(tx, context, "crm.note.created", "CrmNote", note.id);
      return note;
    });
  }

  async createQuote(
    context: TenantContext,
    input: {
      opportunityId: string;
      contactId?: string;
      currency: string;
      discountMinor: number;
      taxMinor: number;
      validUntil?: string;
      terms?: string;
      lines: Array<{
        description: string;
        quantity: number;
        unitPriceMinor: number;
        metadata?: Record<string, unknown>;
      }>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const opportunity = await prisma.crmOpportunity.findFirst({
      where: { id: input.opportunityId, organizationId: context.organizationId },
    });
    if (!opportunity) throw new AppError("NOT_FOUND", "CRM opportunity not found.", 404);
    if (input.contactId) {
      const contact = await prisma.crmContact.findFirst({
        where: {
          id: input.contactId,
          organizationId: context.organizationId,
          accountId: opportunity.accountId,
        },
        select: { id: true },
      });
      if (!contact) throw new AppError("NOT_FOUND", "CRM contact not found.", 404);
    }
    const lines = input.lines.map((line, index) => ({
      ...line,
      position: index + 1,
      unitPriceMinor: BigInt(line.unitPriceMinor),
      totalMinor: BigInt(line.unitPriceMinor) * BigInt(line.quantity),
      metadata: line.metadata ? json(line.metadata) : undefined,
    }));
    const subtotalMinor = lines.reduce(
      (sum, line) => sum + line.totalMinor,
      BigInt(0),
    );
    const totalMinor =
      subtotalMinor - BigInt(input.discountMinor) + BigInt(input.taxMinor);
    if (totalMinor < BigInt(0)) {
      throw new AppError("VALIDATION_ERROR", "Quote total cannot be negative.", 422);
    }
    const quoteNumber = `Q-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return prisma.$transaction(async (tx) => {
      const quote = await tx.crmQuote.create({
        data: {
          organizationId: context.organizationId,
          opportunityId: opportunity.id,
          accountId: opportunity.accountId,
          contactId: input.contactId,
          createdById: context.userId,
          quoteNumber,
          currency: input.currency.toUpperCase(),
          subtotalMinor,
          discountMinor: BigInt(input.discountMinor),
          taxMinor: BigInt(input.taxMinor),
          totalMinor,
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
          terms: input.terms,
          lines: { create: lines },
        },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      await audit(tx, context, "crm.quote.created", "CrmQuote", quote.id, {
        opportunityId: opportunity.id,
        totalMinor: totalMinor.toString(),
      });
      return quote;
    });
  }

  async transitionQuote(
    context: TenantContext,
    input: {
      quoteId: string;
      status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
      expectedVersion: number;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const quote = await prisma.crmQuote.findFirst({
      where: { id: input.quoteId, organizationId: context.organizationId },
    });
    if (!quote) throw new AppError("NOT_FOUND", "CRM quote not found.", 404);
    const allowed: Record<string, string[]> = {
      DRAFT: ["SENT", "EXPIRED"],
      SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
    };
    if (!allowed[quote.status]?.includes(input.status)) {
      throw new AppError(
        "CONFLICT",
        `Quote cannot move from ${quote.status} to ${input.status}.`,
        409,
      );
    }
    return prisma.$transaction(async (tx) => {
      const changed = await tx.crmQuote.updateMany({
        where: {
          id: quote.id,
          organizationId: context.organizationId,
          version: input.expectedVersion,
          status: quote.status,
        },
        data: {
          status: input.status,
          sentAt: input.status === "SENT" ? new Date() : quote.sentAt,
          acceptedAt: input.status === "ACCEPTED" ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new AppError("CONFLICT", "Quote changed before this decision.", 409);
      }
      await audit(tx, context, "crm.quote.transitioned", "CrmQuote", quote.id, {
        status: input.status,
      });
      return tx.crmQuote.findUniqueOrThrow({ where: { id: quote.id } });
    });
  }

  async captureHealth(
    context: TenantContext,
    input: {
      accountId: string;
      score: number;
      signals: Record<string, unknown>;
      source: string;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const account = await prisma.crmAccount.findFirst({
      where: { id: input.accountId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!account) throw new AppError("NOT_FOUND", "CRM account not found.", 404);
    const band =
      input.score >= 80
        ? "HEALTHY"
        : input.score >= 60
          ? "WATCH"
          : input.score >= 40
            ? "AT_RISK"
            : "CRITICAL";
    return prisma.$transaction(async (tx) => {
      const snapshot = await tx.crmCustomerHealthSnapshot.create({
        data: {
          organizationId: context.organizationId,
          accountId: account.id,
          score: input.score,
          band,
          signals: json(input.signals),
          source: input.source,
        },
      });
      await audit(tx, context, "crm.customer_health.captured", "CrmAccount", account.id, {
        score: input.score,
        band,
      });
      return snapshot;
    });
  }

  async recordMetric(
    context: TenantContext,
    input: {
      accountId: string;
      key: string;
      value: number;
      periodStart: string;
      periodEnd: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "crm.manage");
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    if (periodEnd <= periodStart) {
      throw new AppError("VALIDATION_ERROR", "Metric period end must follow its start.", 422);
    }
    const account = await prisma.crmAccount.findFirst({
      where: { id: input.accountId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!account) throw new AppError("NOT_FOUND", "CRM account not found.", 404);
    return prisma.crmCustomerMetric.upsert({
      where: {
        accountId_key_periodStart_periodEnd: {
          accountId: account.id,
          key: input.key,
          periodStart,
          periodEnd,
        },
      },
      create: {
        organizationId: context.organizationId,
        accountId: account.id,
        key: input.key,
        value: input.value,
        periodStart,
        periodEnd,
        metadata: input.metadata ? json(input.metadata) : undefined,
      },
      update: {
        value: input.value,
        metadata: input.metadata ? json(input.metadata) : undefined,
      },
    });
  }
}
