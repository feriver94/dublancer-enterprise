import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { paginationSchema } from "@/lib/validation/project-workspace";
import { ProjectWorkspaceService } from "@/lib/services/project-workspace.service";

const service = new ProjectWorkspaceService();
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, route: Context) {
  try {
    const context = await getAuthenticatedContext();
    const { projectId } = await route.params;
    const input = paginationSchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
    });
    const result = await service.listActivity(context, projectId, input);
    return apiSuccess(result.items, 200, { nextCursor: result.nextCursor });
  } catch (error) {
    return apiError(error);
  }
}
