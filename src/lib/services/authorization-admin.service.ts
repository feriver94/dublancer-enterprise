import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";
import { DEFAULT_ROLES } from "@/lib/authorization/default-roles";

export class AuthorizationAdminService {
  async bootstrap(organizationId: string, actorUserId: string) {
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new AppError("NOT_FOUND", "Organization not found.", 404);
      }

      for (const key of PLATFORM_PERMISSIONS) {
        await tx.permission.upsert({
          where: { key },
          create: { key },
          update: {},
        });
      }

      for (const definition of DEFAULT_ROLES) {
        const role = await tx.role.upsert({
          where: {
            organizationId_name: {
              organizationId,
              name: definition.name,
            },
          },
          create: {
            organizationId,
            name: definition.name,
            description: definition.description,
          },
          update: {
            description: definition.description,
          },
        });

        await tx.rolePermission.deleteMany({
          where: { roleId: role.id },
        });

        const permissions = await tx.permission.findMany({
          where: { key: { in: definition.permissions } },
          select: { id: true },
        });

        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      const ownerRole = await tx.role.findUnique({
        where: {
          organizationId_name: {
            organizationId,
            name: "Owner",
          },
        },
      });

      if (!ownerRole) {
        throw new AppError("INTERNAL_ERROR", "Owner role bootstrap failed.", 500);
      }

      await tx.membership.updateMany({
        where: {
          organizationId,
          userId: actorUserId,
          status: "ACTIVE",
        },
        data: { roleId: ownerRole.id },
      });

      return {
        organizationId,
        roles: DEFAULT_ROLES.length,
        permissions: PLATFORM_PERMISSIONS.length,
      };
    });
  }

  async matrix(organizationId: string) {
    return prisma.role.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { memberships: true } },
      },
    });
  }
}
