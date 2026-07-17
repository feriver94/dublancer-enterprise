import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/authorization/policy-engine";

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    return apiSuccess(await getEffectivePermissions(context));
  } catch (error) {
    return apiError(error);
  }
}
