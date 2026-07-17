import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import type { PlatformPermission } from "./permissions";

export async function resolveAuthorization(context: TenantContext) {
  if (context.isPlatformAdmin) {
    return {
      organizationId: context.organizationId,
      userId: context.userId,
      membershipId: null,
      roleId: null,
      roleName: "Platform Admin",
      permissions: ["*"],
      isPlatformAdmin: true,
    };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      organizationId: context.organizationId,
      userId: context.userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      roleId: true,
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: { key: true },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new AppError("FORBIDDEN", "Active organization membership required.", 403);
  }

  return {
    organizationId: context.organizationId,
    userId: context.userId,
    membershipId: membership.id,
    roleId: membership.roleId,
    roleName: membership.role?.name ?? null,
    permissions: membership.role?.permissions.map((x) => x.permission.key) ?? [],
    isPlatformAdmin: false,
  };
}

export async function requirePermission(
  context: TenantContext,
  permission: PlatformPermission,
) {
  const authorization = await resolveAuthorization(context);

  if (
    !authorization.isPlatformAdmin &&
    !authorization.permissions.includes(permission)
  ) {
    throw new AppError(
      "FORBIDDEN",
      `Missing required permission: ${permission}`,
      403,
    );
  }

  return authorization;
}
