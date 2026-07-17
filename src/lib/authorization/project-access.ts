import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";

export async function requireProjectAccess(
  context: TenantContext,
  projectId: string,
  allowedRoles: Array<"OWNER" | "MANAGER" | "CONTRIBUTOR" | "VIEWER">,
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: context.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      ownerId: true,
      memberships: {
        where: {
          userId: context.userId,
        },
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found.", 404);
  }

  if (context.isPlatformAdmin || project.ownerId === context.userId) {
    return {
      project,
      role: "OWNER" as const,
    };
  }

  const membership = project.memberships[0];

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have sufficient project access.",
      403,
    );
  }

  return {
    project,
    role: membership.role,
  };
}
