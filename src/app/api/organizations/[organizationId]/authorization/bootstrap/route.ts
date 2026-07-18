import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { AuthorizationAdminService } from "@/lib/services/authorization-admin.service";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { assertOrganizationAccess } from "@/lib/tenancy/assert-organization-access";

const service = new AuthorizationAdminService();
type Context = { params: Promise<{ organizationId: string }> };

export async function POST(request: Request, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { organizationId } = await route.params;
    await assertOrganizationAccess(context, organizationId);

    return apiSuccess(
      await service.bootstrap(organizationId, context.userId),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
