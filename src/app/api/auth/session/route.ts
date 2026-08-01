import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    const user = await prisma.user.findUnique({
      where: {
        id: context.userId,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true,
        isPlatformAdmin: true,
        createdAt: true,
        updatedAt: true,
        onboardingProgress: {
          select: { status: true, stage: true, selectedPersonaTypes: true, completedAt: true },
        },
      },
    });

    if (!user) {
      return apiSuccess(
        {
          authenticated: false,
          user: null,
          authorization: null,
        },
        401,
      );
    }

    const authorization =
      context.organizationId || context.isPlatformAdmin
        ? await resolveAuthorization(context)
        : null;

    return apiSuccess({
      authenticated: true,
      user,
      authorization,
      organizationRequired: !context.organizationId,
      activePersona: {
        id: context.activePersonaId,
        type: context.activePersonaType,
      },
      onboardingRequired: user.onboardingProgress?.status !== "COMPLETED",
    });
  } catch (error) {
    return apiError(error);
  }
}
