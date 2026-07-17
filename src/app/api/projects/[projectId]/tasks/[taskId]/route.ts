import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateTaskSchema } from "@/lib/validation/project-workspace";
import { ProjectWorkspaceService } from "@/lib/services/project-workspace.service";

const service = new ProjectWorkspaceService();
type Context = { params: Promise<{ projectId: string; taskId: string }> };

export async function PATCH(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId, taskId } = await route.params;
    const input = updateTaskSchema.parse(await request.json());
    return apiSuccess(await service.updateTask(context, projectId, taskId, input));
  } catch (error) {
    return apiError(error);
  }
}
