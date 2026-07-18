import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    if (!context.organizationId) {
      throw new AppError(
        "NOT_FOUND",
        "No active organization is selected.",
        404,
      );
    }

    const organization = await prisma.organization.findFirst({
      where: {
        id: context.organizationId,
        ...(context.isPlatformAdmin
          ? {}
          : {
              memberships: {
                some: {
                  userId: context.userId,
                  status: "ACTIVE",
                },
              },
            }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      throw new AppError("NOT_FOUND", "Organization not found.", 404);
    }

    return apiSuccess(organization);
  } catch (error) {
    return apiError(error);
  }
}
