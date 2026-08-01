import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import {
  removeProjectMemberSchema,
  updateProjectMemberRoleSchema,
} from "@/lib/validation/project-workspace";
import { ProjectWorkspaceService } from "@/lib/services/project-workspace.service";

const service = new ProjectWorkspaceService();
type Context = {
  params: Promise<{ projectId: string; userId: string }>;
};

export async function PATCH(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId, userId } = await route.params;
    const input = updateProjectMemberRoleSchema.parse(await request.json());
    return apiSuccess(
      await service.updateMemberRole(context, projectId, userId, input.role),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId, userId } = await route.params;
    removeProjectMemberSchema.parse(await request.json());
    return apiSuccess(await service.removeMember(context, projectId, userId));
  } catch (error) {
    return apiError(error);
  }
}
