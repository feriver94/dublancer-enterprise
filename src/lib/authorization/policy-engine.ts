import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { PlatformPermission } from "@/lib/authorization/permissions";
import type { TenantContext } from "@/lib/tenancy/context";

export async function getEffectivePermissions(context: TenantContext) {
  if (context.isPlatformAdmin) {
    return { role: "Platform Admin", permissions: ["*"] };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: context.userId,
      organizationId: context.organizationId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
    },
    select: {
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: { select: { key: true } },
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
    role: membership.role?.name ?? null,
    permissions:
      membership.role?.permissions.map((entry) => entry.permission.key) ?? [],
  };
}

export async function requirePermission(
  context: TenantContext,
  permission: PlatformPermission,
) {
  const effective = await getEffectivePermissions(context);

  if (
    !context.isPlatformAdmin &&
    !effective.permissions.includes(permission)
  ) {
    throw new AppError(
      "FORBIDDEN",
      `Missing required permission: ${permission}`,
      403,
    );
  }

  return effective;
}
