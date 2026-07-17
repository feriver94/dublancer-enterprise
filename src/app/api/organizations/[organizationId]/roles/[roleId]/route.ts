import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateRoleSchema } from "@/lib/validation/identity";
import { IdentityService } from "@/lib/services/identity.service";

const service = new IdentityService();
type Context = { params: Promise<{ roleId: string }> };

export async function PATCH(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { roleId } = await route.params;
    const input = updateRoleSchema.parse(await request.json());
    return apiSuccess(await service.updateRole(context, roleId, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { roleId } = await route.params;
    return apiSuccess(await service.deleteRole(context, roleId));
  } catch (error) {
    return apiError(error);
  }
}
