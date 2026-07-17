import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { AuthorizationAdminService } from "@/lib/services/authorization-admin.service";

const service = new AuthorizationAdminService();
type Context = { params: Promise<{ organizationId: string }> };

export async function POST(_request: Request, route: Context) {
  try {
    const context = await getAuthenticatedContext();
    const { organizationId } = await route.params;

    if (
      !context.isPlatformAdmin &&
      context.organizationId !== organizationId
    ) {
      throw new Error("Cross-organization access denied.");
    }

    return apiSuccess(
      await service.bootstrap(organizationId, context.userId),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
