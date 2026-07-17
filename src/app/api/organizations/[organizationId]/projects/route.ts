import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { projectListQuerySchema } from "@/lib/validation/project";
import { ProjectService } from "@/lib/services/project.service";

export const dynamic = "force-dynamic";

const service = new ProjectService();

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

export async function GET(
  request: NextRequest,
  routeContext: RouteContext,
) {
  try {
    const context = await getAuthenticatedContext();
    const { organizationId } = await routeContext.params;

    if (
      !context.isPlatformAdmin &&
      context.organizationId !== organizationId
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Cross-organization access is not permitted.",
        403,
      );
    }

    const query = projectListQuerySchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });

    const result = await service.list(
      { ...context, organizationId },
      query,
    );

    return apiSuccess(result.items, 200, {
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return apiError(error);
  }
}
