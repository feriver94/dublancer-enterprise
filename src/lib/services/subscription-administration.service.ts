import type { Prisma, SubscriptionEventType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";

function addMonths(value: Date, months = 1) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

async function writeLifecycleEvidence(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    subscriptionId: string;
    actorUserId?: string;
    type: SubscriptionEventType;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.subscriptionEvent.create({ data: input });
  await tx.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: `subscription.${input.type.toLowerCase()}`,
      resourceType: "OrganizationSubscription",
      resourceId: input.subscriptionId,
      outcome: "SUCCESS",
      metadata: input.metadata,
    },
  });
}

export async function ensureSeatForMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
  actorUserId?: string,
) {
  const subscription = await tx.organizationSubscription.findUnique({
    where: { organizationId },
    include: { plan: { include: { usageQuotas: true } } },
  });
  if (!subscription) {
    throw new AppError("CONFLICT", "An active organization subscription is required.", 409);
  }
  if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(subscription.status)) {
    throw new AppError("FORBIDDEN", "The organization subscription does not permit new seats.", 403);
  }
  const seatQuota = subscription.plan.usageQuotas.find((quota) => quota.unit === "ACTIVE_USER");
  const used = await tx.subscriptionSeat.count({
    where: { subscriptionId: subscription.id, status: "ACTIVE" },
  });
  const existing = await tx.subscriptionSeat.findUnique({ where: { membershipId } });
  if (!existing && seatQuota?.enforcement === "HARD" && BigInt(used) >= seatQuota.limit) {
    throw new AppError("CONFLICT", "The subscription seat quota has been reached.", 409, {
      limit: seatQuota.limit.toString(),
      used,
    });
  }
  const seat = existing
    ? await tx.subscriptionSeat.update({
        where: { membershipId },
        data: {
          subscriptionId: subscription.id,
          organizationId,
          status: "ACTIVE",
          assignedAt: new Date(),
          releasedAt: null,
        },
      })
    : await tx.subscriptionSeat.create({
        data: { subscriptionId: subscription.id, organizationId, membershipId },
      });
  if (!existing || existing.status !== "ACTIVE") {
    await writeLifecycleEvidence(tx, {
      organizationId,
      subscriptionId: subscription.id,
      actorUserId,
      type: "SEAT_ASSIGNED",
      metadata: { membershipId, seatId: seat.id },
    });
  }
  return seat;
}

export async function releaseMembershipSeat(
  tx: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
  actorUserId?: string,
) {
  const seat = await tx.subscriptionSeat.findUnique({ where: { membershipId } });
  if (!seat || seat.status === "RELEASED") return null;
  const updated = await tx.subscriptionSeat.update({
    where: { membershipId },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  await writeLifecycleEvidence(tx, {
    organizationId,
    subscriptionId: seat.subscriptionId,
    actorUserId,
    type: "SEAT_RELEASED",
    metadata: { membershipId, seatId: seat.id },
  });
  return updated;
}

export class SubscriptionAdministrationService {
  async plans(context: TenantContext) {
    await requirePermission(context, "finance.read");
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      include: {
        featureEntitlements: { orderBy: { key: "asc" } },
        usageQuotas: { orderBy: { unit: "asc" } },
      },
      orderBy: { priceMinor: "asc" },
    });
  }

  async dashboard(context: TenantContext) {
    await requirePermission(context, "finance.read");
    const subscription = await prisma.organizationSubscription.findUnique({
      where: { organizationId: context.organizationId },
      include: {
        plan: {
          include: {
            featureEntitlements: { orderBy: { key: "asc" } },
            usageQuotas: { orderBy: { unit: "asc" } },
          },
        },
        seats: {
          include: {
            membership: {
              include: {
                user: { select: { id: true, email: true, displayName: true } },
                role: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { assignedAt: "desc" },
        },
        events: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!subscription) {
      throw new AppError("NOT_FOUND", "Organization subscription not found.", 404);
    }
    const usage = await prisma.usageRecord.groupBy({
      by: ["unit"],
      where: {
        organizationId: context.organizationId,
        periodStart: { gte: subscription.currentPeriodStart },
        periodEnd: { lte: subscription.currentPeriodEnd },
      },
      _sum: { quantity: true },
    });
    const activeSeats = subscription.seats.filter((seat) => seat.status === "ACTIVE").length;
    const quotaUsage = subscription.plan.usageQuotas.map((quota) => {
      const recorded =
        quota.unit === "ACTIVE_USER"
          ? BigInt(activeSeats)
          : usage.find((entry) => entry.unit === quota.unit)?._sum.quantity ?? BigInt(0);
      return {
        unit: quota.unit,
        limit: quota.limit,
        used: recorded,
        remaining: quota.limit > recorded ? quota.limit - recorded : BigInt(0),
        exceeded: recorded > quota.limit,
        enforcement: quota.enforcement,
      };
    });
    return { subscription, quotaUsage, activeSeats };
  }

  async transition(
    context: TenantContext,
    input: {
      action:
        | "START_TRIAL"
        | "ACTIVATE"
        | "CHANGE_PLAN"
        | "SCHEDULE_RENEWAL"
        | "RENEW"
        | "SUSPEND"
        | "REACTIVATE"
        | "CANCEL_AT_PERIOD_END"
        | "CANCEL";
      expectedVersion: number;
      planId?: string;
      periodEnd?: Date;
      trialDays?: number;
      reason?: string;
    },
  ) {
    await requirePermission(context, "billing.manage");
    return prisma.$transaction(async (tx) => {
      const current = await tx.organizationSubscription.findUnique({
        where: { organizationId: context.organizationId },
      });
      if (!current) throw new AppError("NOT_FOUND", "Organization subscription not found.", 404);
      if (current.version !== input.expectedVersion) {
        throw new AppError("CONFLICT", "Subscription version conflict.", 409);
      }

      const now = new Date();
      let status: SubscriptionStatus = current.status;
      let type: SubscriptionEventType = "ADMIN_OVERRIDE";
      const data: Prisma.OrganizationSubscriptionUncheckedUpdateInput = {
        version: { increment: 1 },
      };
      if (input.action === "START_TRIAL") {
        status = "TRIALING";
        type = "TRIAL_STARTED";
        data.trialStartedAt = now;
        data.trialEndsAt = new Date(now.getTime() + (input.trialDays ?? 14) * 86_400_000);
        data.currentPeriodStart = now;
        data.currentPeriodEnd = data.trialEndsAt;
        data.renewAt = data.trialEndsAt;
      } else if (input.action === "ACTIVATE") {
        status = "ACTIVE";
        type = "BILLING_STATUS_CHANGED";
      } else if (input.action === "CHANGE_PLAN") {
        if (!input.planId) throw new AppError("BAD_REQUEST", "A plan is required.", 400);
        const plan = await tx.subscriptionPlan.findFirst({ where: { id: input.planId, isActive: true } });
        if (!plan) throw new AppError("NOT_FOUND", "Subscription plan not found.", 404);
        data.planId = plan.id;
        type = "PLAN_CHANGED";
      } else if (input.action === "SCHEDULE_RENEWAL") {
        data.renewAt = input.periodEnd ?? current.currentPeriodEnd;
        type = "RENEWAL_SCHEDULED";
      } else if (input.action === "RENEW") {
        status = "ACTIVE";
        type = "RENEWED";
        data.currentPeriodStart = now;
        data.currentPeriodEnd = input.periodEnd ?? addMonths(now);
        data.renewAt = data.currentPeriodEnd;
        data.renewedAt = now;
        data.cancelAtPeriodEnd = false;
        data.cancelledAt = null;
      } else if (input.action === "SUSPEND") {
        if (!input.reason) throw new AppError("BAD_REQUEST", "Suspension reason is required.", 400);
        status = "SUSPENDED";
        type = "SUSPENDED";
        data.suspendedAt = now;
        data.suspensionReason = input.reason;
      } else if (input.action === "REACTIVATE") {
        status = "ACTIVE";
        type = "REACTIVATED";
        data.reactivatedAt = now;
        data.suspensionReason = null;
      } else if (input.action === "CANCEL_AT_PERIOD_END") {
        data.cancelAtPeriodEnd = true;
        data.cancellationReason = input.reason;
        type = "CANCELLATION_SCHEDULED";
      } else {
        status = "CANCELLED";
        type = "CANCELLED";
        data.cancelledAt = now;
        data.cancellationReason = input.reason;
      }
      data.status = status;

      const guarded = await tx.organizationSubscription.updateMany({
        where: { id: current.id, version: input.expectedVersion },
        data,
      });
      if (guarded.count !== 1) throw new AppError("CONFLICT", "Subscription version conflict.", 409);
      await writeLifecycleEvidence(tx, {
        organizationId: context.organizationId,
        subscriptionId: current.id,
        actorUserId: context.userId,
        type,
        reason: input.reason,
        metadata: {
          action: input.action,
          previousStatus: current.status,
          status,
          previousPlanId: current.planId,
          planId: input.planId ?? current.planId,
        },
      });
      return tx.organizationSubscription.findUniqueOrThrow({
        where: { id: current.id },
        include: { plan: { include: { featureEntitlements: true, usageQuotas: true } }, events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
    });
  }

  async configureLegacy(
    context: TenantContext,
    input: {
      planId: string;
      status: SubscriptionStatus;
      currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean;
    },
  ) {
    await requirePermission(context, "billing.manage");
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: input.planId, isActive: true } });
    if (!plan) throw new AppError("NOT_FOUND", "Subscription plan not found.", 404);
    return prisma.$transaction(async (tx) => {
      const current = await tx.organizationSubscription.findUnique({
        where: { organizationId: context.organizationId },
      });
      const subscription = await tx.organizationSubscription.upsert({
        where: { organizationId: context.organizationId },
        create: {
          organizationId: context.organizationId,
          planId: input.planId,
          status: input.status,
          currentPeriodStart: new Date(),
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        },
        update: {
          planId: input.planId,
          status: input.status,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          version: { increment: 1 },
        },
      });
      await writeLifecycleEvidence(tx, {
        organizationId: context.organizationId,
        subscriptionId: subscription.id,
        actorUserId: context.userId,
        type: "ADMIN_OVERRIDE",
        reason: "Compatibility subscription administration endpoint.",
        metadata: {
          previousStatus: current?.status ?? null,
          status: input.status,
          previousPlanId: current?.planId ?? null,
          planId: input.planId,
        },
      });
      return subscription;
    });
  }
}
