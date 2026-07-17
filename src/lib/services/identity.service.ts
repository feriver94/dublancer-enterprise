import { createHash } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission, resolveAuthorization } from "@/lib/authorization/permission-resolver";

export class IdentityService {
  async getCurrentUser(context: TenantContext) {
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isPlatformAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new AppError("NOT_FOUND", "User not found.", 404);

    return {
      user,
      authorization: await resolveAuthorization(context),
    };
  }

  async updateCurrentUser(
    context: TenantContext,
    input: { email?: string; displayName?: string | null },
  ) {
    return prisma.user.update({
      where: { id: context.userId },
      data: input,
      select: {
        id: true,
        email: true,
        displayName: true,
        isPlatformAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listOrganizations(context: TenantContext) {
    return prisma.membership.findMany({
      where: {
        userId: context.userId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      select: {
        id: true,
        role: { select: { id: true, name: true } },
        organization: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async switchOrganization(context: TenantContext, organizationId: string) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: context.userId,
        organizationId,
        status: "ACTIVE",
      },
      include: { role: true },
    });

    if (!membership && !context.isPlatformAdmin) {
      throw new AppError("FORBIDDEN", "Organization access denied.", 403);
    }

    return {
      organizationId,
      membershipId: membership?.id ?? null,
      role: membership?.role ?? null,
      sessionUpdateRequired: true,
    };
  }

  async listRoles(context: TenantContext) {
    await requirePermission(context, "organization.roles.read");

    return prisma.role.findMany({
      where: { organizationId: context.organizationId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createRole(context: TenantContext, input: {
    name: string;
    description?: string;
    permissionKeys: string[];
  }) {
    await requirePermission(context, "organization.roles.manage");

    return prisma.$transaction(async (tx) => {
      const permissions = await Promise.all(
        input.permissionKeys.map((key) =>
          tx.permission.upsert({
            where: { key },
            create: { key },
            update: {},
          }),
        ),
      );

      return tx.role.create({
        data: {
          organizationId: context.organizationId,
          name: input.name,
          description: input.description,
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });
    });
  }

  async updateRole(context: TenantContext, roleId: string, input: {
    name?: string;
    description?: string;
    permissionKeys?: string[];
  }) {
    await requirePermission(context, "organization.roles.manage");

    return prisma.$transaction(async (tx) => {
      if (input.permissionKeys) {
        await tx.rolePermission.deleteMany({ where: { roleId } });

        const permissions = await Promise.all(
          input.permissionKeys.map((key) =>
            tx.permission.upsert({
              where: { key },
              create: { key },
              update: {},
            }),
          ),
        );

        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return tx.role.update({
        where: {
          id: roleId,
          organizationId: context.organizationId,
        },
        data: {
          name: input.name,
          description: input.description,
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });
    });
  }

  async deleteRole(context: TenantContext, roleId: string) {
    await requirePermission(context, "organization.roles.manage");

    const assigned = await prisma.membership.count({
      where: {
        organizationId: context.organizationId,
        roleId,
        status: { in: ["ACTIVE", "SUSPENDED", "INVITED"] },
      },
    });

    if (assigned > 0) {
      throw new AppError(
        "CONFLICT",
        "Role cannot be deleted while assigned.",
        409,
      );
    }

    return prisma.role.delete({
      where: {
        id: roleId,
        organizationId: context.organizationId,
      },
    });
  }

  async assignRole(
    context: TenantContext,
    membershipId: string,
    roleId: string | null,
  ) {
    await requirePermission(context, "organization.members.manage");

    if (roleId) {
      const role = await prisma.role.findFirst({
        where: {
          id: roleId,
          organizationId: context.organizationId,
        },
      });

      if (!role) throw new AppError("NOT_FOUND", "Role not found.", 404);
    }

    return prisma.membership.update({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
      },
      data: { roleId },
      include: { role: true },
    });
  }

  async performMembershipAction(
    context: TenantContext,
    membershipId: string,
    action: "SUSPEND" | "RESTORE" | "REMOVE",
  ) {
    await requirePermission(context, "organization.members.manage");

    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
      },
    });

    if (!membership) {
      throw new AppError("NOT_FOUND", "Membership not found.", 404);
    }

    if (membership.userId === context.userId && action === "REMOVE") {
      throw new AppError(
        "CONFLICT",
        "You cannot remove your own membership.",
        409,
      );
    }

    const status =
      action === "SUSPEND"
        ? "SUSPENDED"
        : action === "RESTORE"
          ? "ACTIVE"
          : "REMOVED";

    return prisma.membership.update({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
      },
      data: { status },
    });
  }

  async acceptInvitation(context: TenantContext, rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    return prisma.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: {
          tokenHash,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (!invitation) {
        throw new AppError(
          "NOT_FOUND",
          "Invitation is invalid, expired, or already used.",
          404,
        );
      }

      const user = await tx.user.findUnique({
        where: { id: context.userId },
      });

      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new AppError(
          "FORBIDDEN",
          "Invitation belongs to another email address.",
          403,
        );
      }

      const membership = await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: context.userId,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: context.userId,
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

      return {
        membership,
        organizationId: invitation.organizationId,
      };
    });
  }
}
