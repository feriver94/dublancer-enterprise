import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/policy-engine";

export class OrganizationLifecycleService {
  private assertTenant(context: TenantContext, organizationId: string) {
    if (!context.isPlatformAdmin && context.organizationId !== organizationId) {
      throw new AppError("FORBIDDEN", "Cross-organization access is not permitted.", 403);
    }
  }

  async invite(context: TenantContext, organizationId: string, input: {
    email: string; roleId?: string; expiresInHours: number;
  }) {
    this.assertTenant(context, organizationId);
    await requirePermission(context, "organization.invitations.manage");

    if (input.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: input.roleId, organizationId },
        select: { id: true },
      });
      if (!role) throw new AppError("NOT_FOUND", "Role not found.", 404);
    }

    const rawToken = randomBytes(48).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.organizationInvitation.updateMany({
        where: { organizationId, email: input.email, status: "PENDING" },
        data: { status: "REVOKED" },
      });

      const created = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email: input.email,
          roleId: input.roleId,
          tokenHash,
          expiresAt: new Date(Date.now() + input.expiresInHours * 3600000),
          createdById: context.userId,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: context.userId,
          action: "organization.invitation.create",
          resourceType: "OrganizationInvitation",
          resourceId: created.id,
          outcome: "SUCCESS",
          metadata: { email: input.email, roleId: input.roleId ?? null },
        },
      });

      return created;
    });

    return { invitation, ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEVELOPMENT_TOKENS === "true" ? { developmentToken: rawToken } : {}) };
  }

  async accept(context: TenantContext, rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    return prisma.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: { tokenHash, status: "PENDING", expiresAt: { gt: new Date() } },
      });
      if (!invitation) throw new AppError("NOT_FOUND", "Invitation is invalid or expired.", 404);

      const user = await tx.user.findUnique({
        where: { id: context.userId },
        select: { id: true, email: true },
      });
      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new AppError("FORBIDDEN", "Invitation belongs to another email.", 403);
      }

      const membership = await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
          status: "ACTIVE",
        },
        update: {
          roleId: invitation.roleId,
          status: "ACTIVE",
        },
      });

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });

      return { organizationId: invitation.organizationId, membership };
    });
  }

  async memberAction(context: TenantContext, organizationId: string, membershipId: string, action: "SUSPEND"|"RESTORE"|"REMOVE") {
    this.assertTenant(context, organizationId);
    await requirePermission(context, "organization.members.manage");

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: { role: { select: { name: true } } },
    });
    if (!membership) throw new AppError("NOT_FOUND", "Membership not found.", 404);
    if (membership.userId === context.userId && action === "REMOVE") {
      throw new AppError("CONFLICT", "You cannot remove your own membership.", 409);
    }
    if (membership.role?.name === "Owner" && action !== "RESTORE") {
      throw new AppError("CONFLICT", "Transfer ownership first.", 409);
    }

    const status = action === "SUSPEND" ? "SUSPENDED" : action === "RESTORE" ? "ACTIVE" : "REMOVED";
    return prisma.membership.update({
      where: { id: membershipId, organizationId },
      data: { status },
    });
  }

  async assignRole(context: TenantContext, organizationId: string, membershipId: string, roleId: string) {
    this.assertTenant(context, organizationId);
    await requirePermission(context, "organization.members.manage");

    const role = await prisma.role.findFirst({ where: { id: roleId, organizationId } });
    if (!role) throw new AppError("NOT_FOUND", "Role not found.", 404);
    if (role.name === "Owner") throw new AppError("CONFLICT", "Use ownership transfer.", 409);

    return prisma.membership.update({
      where: { id: membershipId, organizationId },
      data: { roleId },
      include: { role: true, user: true },
    });
  }

  async transferOwnership(context: TenantContext, organizationId: string, targetMembershipId: string) {
    this.assertTenant(context, organizationId);

    return prisma.$transaction(async (tx) => {
      const ownerRole = await tx.role.findUnique({
        where: { organizationId_name: { organizationId, name: "Owner" } },
      });
      const adminRole = await tx.role.findUnique({
        where: { organizationId_name: { organizationId, name: "Admin" } },
      });
      if (!ownerRole || !adminRole) throw new AppError("CONFLICT", "Default roles missing.", 409);

      const currentOwner = await tx.membership.findFirst({
        where: {
          organizationId,
          userId: context.userId,
          roleId: ownerRole.id,
          status: "ACTIVE",
        },
      });
      if (!currentOwner && !context.isPlatformAdmin) {
        throw new AppError("FORBIDDEN", "Only the current owner can transfer ownership.", 403);
      }

      const target = await tx.membership.findFirst({
        where: { id: targetMembershipId, organizationId, status: "ACTIVE" },
      });
      if (!target) throw new AppError("NOT_FOUND", "Target membership not found.", 404);

      await tx.membership.update({
        where: { id: target.id, organizationId },
        data: { roleId: ownerRole.id },
      });

      if (currentOwner && currentOwner.id !== target.id) {
        await tx.membership.update({
          where: { id: currentOwner.id, organizationId },
          data: { roleId: adminRole.id },
        });
      }

      return {
        organizationId,
        previousOwnerMembershipId: currentOwner?.id ?? null,
        newOwnerMembershipId: target.id,
      };
    });
  }
}
