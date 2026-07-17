import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateProjectSchema } from "@/lib/validation/project";
import { ProjectService } from "@/lib/services/project.service";

export const dynamic = "force-dynamic";

const service = new ProjectService();

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  request: NextRequest,
  routeContext: RouteContext,
) {
  try {
    const context = await getAuthenticatedContext();
    const { projectId } = await routeContext.params;
    const project = await service.get(context, projectId);

    return apiSuccess(project);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext,
) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId } = await routeContext.params;
    const payload = updateProjectSchema.parse(await request.json());
    const project = await service.update(context, projectId, payload);

    return apiSuccess(project);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  routeContext: RouteContext,
) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId } = await routeContext.params;
    const project = await service.delete(context, projectId);

    return apiSuccess(project);
  } catch (error) {
    return apiError(error);
  }
}
