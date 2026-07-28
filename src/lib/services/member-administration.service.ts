import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { EmailOperationsService } from "@/lib/services/email-operations.service";
import { releaseMembershipSeat } from "@/lib/services/subscription-administration.service";

const emailOperations = new EmailOperationsService();

async function tenantMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
) {
  const membership = await tx.membership.findFirst({
    where: { id: membershipId, organizationId },
    include: { role: true, user: { select: { email: true, displayName: true, preferredLocale: true } } },
  });
  if (!membership) throw new AppError("NOT_FOUND", "Membership not found.", 404);
  return membership;
}

async function protectLastOwner(
  tx: Prisma.TransactionClient,
  organizationId: string,
  membershipId: string,
  nextRoleId?: string | null,
  nextStatus?: "ACTIVE" | "SUSPENDED" | "REMOVED",
) {
  const membership = await tx.membership.findFirst({
    where: { id: membershipId, organizationId },
    include: { role: { select: { name: true } } },
  });
  if (!membership) throw new AppError("NOT_FOUND", "Membership not found.", 404);
  if (membership.role?.name !== "Owner" || membership.status !== "ACTIVE") return;
  const nextRole = nextRoleId
    ? await tx.role.findFirst({ where: { id: nextRoleId, organizationId }, select: { name: true } })
    : null;
  const remainsOwner = nextRoleId === undefined || nextRole?.name === "Owner";
  const remainsActive = nextStatus === undefined || nextStatus === "ACTIVE";
  if (remainsOwner && remainsActive) return;
  const owners = await tx.membership.count({
    where: { organizationId, status: "ACTIVE", role: { name: "Owner" } },
  });
  if (owners <= 1) throw new AppError("CONFLICT", "The last active owner cannot be changed or removed.", 409);
}

export class MemberAdministrationService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "organization.members.read");
    const [members, roles, invitations, departments, teams, reviews, audits] = await Promise.all([
      prisma.membership.findMany({
        where: { organizationId: context.organizationId },
        include: {
          user: { select: { id: true, email: true, displayName: true, preferredLocale: true } },
          role: { include: { permissions: { include: { permission: true } } } },
          teamMemberships: { include: { team: { select: { id: true, name: true } } } },
          subscriptionSeat: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.role.findMany({
        where: { organizationId: context.organizationId },
        include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.organizationInvitation.findMany({
        where: { organizationId: context.organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.department.findMany({
        where: { organizationId: context.organizationId },
        include: {
          manager: { include: { user: { select: { email: true, displayName: true } } } },
          children: { select: { id: true, name: true } },
          _count: { select: { teams: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.team.findMany({
        where: { organizationId: context.organizationId },
        include: {
          department: { select: { id: true, name: true } },
          manager: { include: { user: { select: { email: true, displayName: true } } } },
          memberships: { include: { membership: { include: { user: { select: { email: true, displayName: true } } } } } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.accessReview.findMany({
        where: { organizationId: context.organizationId },
        include: {
          items: {
            include: {
              membership: { include: { user: { select: { email: true, displayName: true } }, role: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.permissionAudit.findMany({
        where: { organizationId: context.organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return { members, roles, invitations, departments, teams, accessReviews: reviews, permissionAudits: audits };
  }

  async bulkInvite(
    context: TenantContext,
    invitations: Array<{ email: string; roleId?: string; expiresInHours: number }>,
  ) {
    await requirePermission(context, "organization.invitations.manage");
    if (invitations.length < 1 || invitations.length > 100) {
      throw new AppError("BAD_REQUEST", "Bulk invitations must contain between 1 and 100 recipients.", 400);
    }
    const normalized = invitations.map((item) => ({ ...item, email: item.email.toLowerCase() }));
    if (new Set(normalized.map((item) => item.email)).size !== normalized.length) {
      throw new AppError("CONFLICT", "Bulk invitations contain duplicate email addresses.", 409);
    }

    const subscription = await prisma.organizationSubscription.findUnique({
      where: { organizationId: context.organizationId },
      include: { plan: { include: { usageQuotas: true } } },
    });
    if (!subscription || !["TRIALING", "ACTIVE", "PAST_DUE"].includes(subscription.status)) {
      throw new AppError("FORBIDDEN", "The organization subscription does not permit invitations.", 403);
    }
    const quota = subscription.plan.usageQuotas.find((item) => item.unit === "ACTIVE_USER");
    const [activeSeats, pendingInvitations] = await Promise.all([
      prisma.subscriptionSeat.count({ where: { subscriptionId: subscription.id, status: "ACTIVE" } }),
      prisma.organizationInvitation.count({ where: { organizationId: context.organizationId, status: "PENDING", expiresAt: { gt: new Date() } } }),
    ]);
    if (
      quota?.enforcement === "HARD" &&
      BigInt(activeSeats + pendingInvitations + normalized.length) > quota.limit
    ) {
      throw new AppError("CONFLICT", "Bulk invitations exceed the subscription seat quota.", 409, {
        limit: quota.limit.toString(),
        activeSeats,
        pendingInvitations,
        requested: normalized.length,
      });
    }

    const prepared = normalized.map((item) => {
      const token = randomBytes(32).toString("hex");
      return { ...item, token, tokenHash: createHash("sha256").update(token).digest("hex") };
    });
    const created = await prisma.$transaction(async (tx) => {
      const roleIds = [...new Set(prepared.map((item) => item.roleId).filter(Boolean))] as string[];
      if (roleIds.length) {
        const roleCount = await tx.role.count({
          where: { organizationId: context.organizationId, id: { in: roleIds } },
        });
        if (roleCount !== roleIds.length) throw new AppError("NOT_FOUND", "One or more roles were not found.", 404);
      }
      const existing = await tx.organizationInvitation.findMany({
        where: {
          organizationId: context.organizationId,
          email: { in: prepared.map((item) => item.email) },
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { email: true },
      });
      if (existing.length) {
        throw new AppError("CONFLICT", "One or more recipients already have a pending invitation.", 409, {
          emails: existing.map((item) => item.email),
        });
      }
      const rows = [];
      for (const item of prepared) {
        rows.push(await tx.organizationInvitation.create({
          data: {
            organizationId: context.organizationId,
            email: item.email,
            roleId: item.roleId,
            tokenHash: item.tokenHash,
            expiresAt: new Date(Date.now() + item.expiresInHours * 3_600_000),
            createdById: context.userId,
          },
        }));
      }
      await tx.organizationActivity.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          type: "INVITATION_CREATED",
          resourceType: "OrganizationInvitation",
          summary: `${rows.length} organization invitations created.`,
          metadata: { invitationIds: rows.map((item) => item.id) },
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "organization.invitations.bulk_create",
          resourceType: "OrganizationInvitation",
          outcome: "SUCCESS",
          metadata: { count: rows.length },
        },
      });
      return rows;
    });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      include: { branding: true },
    });
    for (const [index, invitation] of created.entries()) {
      const item = prepared[index];
      const actionUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/accept-invitation?token=${encodeURIComponent(item.token)}`;
      await emailOperations.queue({
        organizationId: context.organizationId,
        recipient: item.email,
        templateKey: "organization-invitation",
        variables: {
          organizationName: organization.name,
          actionUrl,
          primaryColor: organization.branding?.primaryColor ?? "#009A44",
        },
        metadata: { invitationId: invitation.id, actionUrl },
      });
    }
    return {
      invitations: created,
      count: created.length,
      ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEVELOPMENT_TOKENS === "true"
        ? { developmentTokens: prepared.map((item) => ({ email: item.email, token: item.token })) }
        : {}),
    };
  }

  async bulkRoleChange(
    context: TenantContext,
    membershipIds: string[],
    roleId: string,
  ) {
    await requirePermission(context, "organization.members.manage");
    if (membershipIds.length < 1 || membershipIds.length > 100) {
      throw new AppError("BAD_REQUEST", "Bulk role changes must contain between 1 and 100 members.", 400);
    }
    const uniqueIds = [...new Set(membershipIds)];
    return prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({ where: { id: roleId, organizationId: context.organizationId } });
      if (!role) throw new AppError("NOT_FOUND", "Role not found.", 404);
      const count = await tx.membership.count({
        where: { id: { in: uniqueIds }, organizationId: context.organizationId },
      });
      if (count !== uniqueIds.length) throw new AppError("NOT_FOUND", "One or more memberships were not found.", 404);
      for (const membershipId of uniqueIds) {
        await protectLastOwner(tx, context.organizationId, membershipId, roleId);
      }
      await tx.membership.updateMany({
        where: { id: { in: uniqueIds }, organizationId: context.organizationId },
        data: { roleId },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "organization.members.bulk_role_change",
          resourceType: "Membership",
          outcome: "SUCCESS",
          metadata: { membershipIds: uniqueIds, roleId },
        },
      });
      return tx.membership.findMany({
        where: { id: { in: uniqueIds }, organizationId: context.organizationId },
        include: { role: true, user: { select: { email: true, displayName: true } } },
      });
    });
  }

  async createDepartment(
    context: TenantContext,
    input: { name: string; description?: string; parentId?: string; managerMembershipId?: string },
  ) {
    await requirePermission(context, "organization.members.manage");
    return prisma.$transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.department.findFirst({ where: { id: input.parentId, organizationId: context.organizationId } });
        if (!parent) throw new AppError("NOT_FOUND", "Parent department not found.", 404);
      }
      if (input.managerMembershipId) await tenantMembership(tx, context.organizationId, input.managerMembershipId);
      const department = await tx.department.create({
        data: { organizationId: context.organizationId, ...input },
      });
      await tx.auditEvent.create({
        data: { organizationId: context.organizationId, actorUserId: context.userId, action: "organization.department.created", resourceType: "Department", resourceId: department.id, outcome: "SUCCESS" },
      });
      return department;
    });
  }

  async updateDepartment(
    context: TenantContext,
    departmentId: string,
    input: { name?: string; description?: string | null; parentId?: string | null; managerMembershipId?: string | null },
  ) {
    await requirePermission(context, "organization.members.manage");
    return prisma.$transaction(async (tx) => {
      const department = await tx.department.findFirst({ where: { id: departmentId, organizationId: context.organizationId } });
      if (!department) throw new AppError("NOT_FOUND", "Department not found.", 404);
      if (input.parentId === departmentId) throw new AppError("CONFLICT", "A department cannot be its own parent.", 409);
      if (input.parentId) {
        let cursor: string | null = input.parentId;
        while (cursor) {
          if (cursor === departmentId) throw new AppError("CONFLICT", "Department hierarchy cannot contain a cycle.", 409);
          const parent: { parentId: string | null } | null = await tx.department.findFirst({
            where: { id: cursor, organizationId: context.organizationId },
            select: { parentId: true },
          });
          if (!parent) throw new AppError("NOT_FOUND", "Parent department not found.", 404);
          cursor = parent.parentId;
        }
      }
      if (input.managerMembershipId) await tenantMembership(tx, context.organizationId, input.managerMembershipId);
      return tx.department.update({ where: { id: departmentId }, data: input });
    });
  }

  async deleteDepartment(context: TenantContext, departmentId: string) {
    await requirePermission(context, "organization.members.manage");
    const department = await prisma.department.findFirst({
      where: { id: departmentId, organizationId: context.organizationId },
      include: { _count: { select: { children: true, teams: true } } },
    });
    if (!department) throw new AppError("NOT_FOUND", "Department not found.", 404);
    if (department._count.children || department._count.teams) {
      throw new AppError("CONFLICT", "Move child departments and teams before deleting this department.", 409);
    }
    return prisma.department.delete({ where: { id: departmentId } });
  }

  async createTeam(
    context: TenantContext,
    input: { name: string; description?: string; departmentId?: string; managerMembershipId?: string; membershipIds?: string[] },
  ) {
    await requirePermission(context, "organization.members.manage");
    return prisma.$transaction(async (tx) => {
      if (input.departmentId) {
        const department = await tx.department.findFirst({ where: { id: input.departmentId, organizationId: context.organizationId } });
        if (!department) throw new AppError("NOT_FOUND", "Department not found.", 404);
      }
      const membershipIds = [...new Set(input.membershipIds ?? [])];
      for (const membershipId of [...membershipIds, ...(input.managerMembershipId ? [input.managerMembershipId] : [])]) {
        await tenantMembership(tx, context.organizationId, membershipId);
      }
      const team = await tx.team.create({
        data: {
          organizationId: context.organizationId,
          name: input.name,
          description: input.description,
          departmentId: input.departmentId,
          managerMembershipId: input.managerMembershipId,
          memberships: { create: membershipIds.map((membershipId) => ({ membershipId })) },
        },
        include: { memberships: true },
      });
      await tx.auditEvent.create({
        data: { organizationId: context.organizationId, actorUserId: context.userId, action: "organization.team.created", resourceType: "Team", resourceId: team.id, outcome: "SUCCESS" },
      });
      return team;
    });
  }

  async updateTeam(
    context: TenantContext,
    teamId: string,
    input: { name?: string; description?: string | null; departmentId?: string | null; managerMembershipId?: string | null; membershipIds?: string[] },
  ) {
    await requirePermission(context, "organization.members.manage");
    return prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({ where: { id: teamId, organizationId: context.organizationId } });
      if (!team) throw new AppError("NOT_FOUND", "Team not found.", 404);
      if (input.departmentId) {
        const department = await tx.department.findFirst({ where: { id: input.departmentId, organizationId: context.organizationId } });
        if (!department) throw new AppError("NOT_FOUND", "Department not found.", 404);
      }
      const membershipIds = input.membershipIds ? [...new Set(input.membershipIds)] : undefined;
      for (const membershipId of [...(membershipIds ?? []), ...(input.managerMembershipId ? [input.managerMembershipId] : [])]) {
        await tenantMembership(tx, context.organizationId, membershipId);
      }
      if (membershipIds) {
        await tx.teamMembership.deleteMany({ where: { teamId } });
        await tx.teamMembership.createMany({ data: membershipIds.map((membershipId) => ({ teamId, membershipId })) });
      }
      const { membershipIds: _membershipIds, ...data } = input;
      return tx.team.update({ where: { id: teamId }, data, include: { memberships: true } });
    });
  }

  async deleteTeam(context: TenantContext, teamId: string) {
    await requirePermission(context, "organization.members.manage");
    const team = await prisma.team.findFirst({ where: { id: teamId, organizationId: context.organizationId } });
    if (!team) throw new AppError("NOT_FOUND", "Team not found.", 404);
    return prisma.team.delete({ where: { id: teamId } });
  }

  async runPermissionAudit(context: TenantContext) {
    await requirePermission(context, "audit.read");
    const members = await prisma.membership.findMany({
      where: { organizationId: context.organizationId },
      include: {
        user: { select: { email: true } },
        role: { include: { permissions: { include: { permission: true } } } },
        subscriptionSeat: true,
      },
    });
    const snapshot = members.map((member) => ({
      membershipId: member.id,
      email: member.user.email,
      status: member.status,
      roleId: member.roleId,
      roleName: member.role?.name ?? null,
      permissions: member.role?.permissions.map((item) => item.permission.key).sort() ?? [],
    }));
    const findings = [
      ...members.filter((member) => member.status === "ACTIVE" && !member.roleId).map((member) => ({ code: "ACTIVE_WITHOUT_ROLE", membershipId: member.id, severity: "HIGH" })),
      ...members.filter((member) => member.status !== "ACTIVE" && member.subscriptionSeat?.status === "ACTIVE").map((member) => ({ code: "INACTIVE_WITH_SEAT", membershipId: member.id, severity: "MEDIUM" })),
      ...members.filter((member) => (member.role?.permissions.length ?? 0) >= 35 && member.role?.name !== "Owner").map((member) => ({ code: "BROAD_PERMISSION_SET", membershipId: member.id, severity: "MEDIUM" })),
    ];
    return prisma.permissionAudit.create({
      data: {
        organizationId: context.organizationId,
        initiatedById: context.userId,
        snapshot,
        findings,
      },
    });
  }

  async createAccessReview(
    context: TenantContext,
    input: { title: string; dueAt?: Date },
  ) {
    await requirePermission(context, "organization.members.manage");
    const members = await prisma.membership.findMany({
      where: { organizationId: context.organizationId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { id: true, roleId: true },
    });
    return prisma.accessReview.create({
      data: {
        organizationId: context.organizationId,
        title: input.title,
        dueAt: input.dueAt,
        createdById: context.userId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        items: { create: members.map((member) => ({ membershipId: member.id, currentRoleId: member.roleId })) },
      },
      include: { items: true },
    });
  }

  async decideAccessReviewItem(
    context: TenantContext,
    reviewId: string,
    itemId: string,
    input: { decision: "RETAIN" | "CHANGE_ROLE" | "SUSPEND" | "REMOVE"; proposedRoleId?: string; note?: string },
  ) {
    await requirePermission(context, "organization.members.manage");
    return prisma.$transaction(async (tx) => {
      const item = await tx.accessReviewItem.findFirst({
        where: {
          id: itemId,
          accessReviewId: reviewId,
          accessReview: { organizationId: context.organizationId, status: "IN_PROGRESS" },
        },
      });
      if (!item) throw new AppError("NOT_FOUND", "Access review item not found.", 404);
      if (input.decision === "CHANGE_ROLE") {
        if (!input.proposedRoleId) throw new AppError("BAD_REQUEST", "A proposed role is required.", 400);
        const role = await tx.role.findFirst({ where: { id: input.proposedRoleId, organizationId: context.organizationId } });
        if (!role) throw new AppError("NOT_FOUND", "Role not found.", 404);
        await protectLastOwner(tx, context.organizationId, item.membershipId, role.id);
        await tx.membership.update({ where: { id: item.membershipId }, data: { roleId: role.id } });
      } else if (input.decision === "SUSPEND" || input.decision === "REMOVE") {
        const status = input.decision === "SUSPEND" ? "SUSPENDED" : "REMOVED";
        await protectLastOwner(tx, context.organizationId, item.membershipId, undefined, status);
        await tx.membership.update({ where: { id: item.membershipId }, data: { status } });
        await releaseMembershipSeat(tx, context.organizationId, item.membershipId, context.userId);
      }
      const updated = await tx.accessReviewItem.update({
        where: { id: item.id },
        data: {
          decision: input.decision,
          proposedRoleId: input.proposedRoleId,
          reviewNote: input.note,
          reviewedById: context.userId,
          reviewedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "organization.access_review.item_decided",
          resourceType: "AccessReviewItem",
          resourceId: item.id,
          outcome: "SUCCESS",
          metadata: { decision: input.decision, proposedRoleId: input.proposedRoleId ?? null },
        },
      });
      return updated;
    });
  }

  async completeAccessReview(context: TenantContext, reviewId: string) {
    await requirePermission(context, "organization.members.manage");
    const review = await prisma.accessReview.findFirst({
      where: { id: reviewId, organizationId: context.organizationId, status: "IN_PROGRESS" },
      include: { items: { select: { decision: true } } },
    });
    if (!review) throw new AppError("NOT_FOUND", "Access review not found.", 404);
    if (review.items.some((item) => item.decision === "PENDING")) {
      throw new AppError("CONFLICT", "Every access review item must be decided before completion.", 409);
    }
    return prisma.accessReview.update({
      where: { id: reviewId },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { items: true },
    });
  }
}
