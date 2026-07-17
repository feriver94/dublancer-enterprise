import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";

export async function assertOrganizationAccess(context: TenantContext, organizationId: string) {
  if (context.isPlatformAdmin) return;
  if (context.organizationId !== organizationId) {
    throw new AppError("FORBIDDEN", "Cross-organization access is not permitted.", 403);
  }
  const membership = await prisma.membership.findFirst({
    where: { organizationId, userId: context.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) throw new AppError("FORBIDDEN", "Active membership required.", 403);
}
