import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { createTaskSchema } from "@/lib/validation/project-workspace";
import { ProjectWorkspaceService } from "@/lib/services/project-workspace.service";

const service = new ProjectWorkspaceService();
type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId } = await route.params;
    const input = createTaskSchema.parse(await request.json());
    return apiSuccess(await service.createTask(context, projectId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
