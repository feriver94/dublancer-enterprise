import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { assignRoleSchema } from "@/lib/validation/organization-lifecycle";
import { OrganizationLifecycleService } from "@/lib/services/organization-lifecycle.service";

const service = new OrganizationLifecycleService();
type Context = { params: Promise<{ organizationId: string; membershipId: string }> };

export async function PUT(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { organizationId, membershipId } = await route.params;
    const { roleId } = assignRoleSchema.parse(await request.json());
    return apiSuccess(await service.assignRole(context, organizationId, membershipId, roleId));
  } catch (error) {
    return apiError(error);
  }
}
