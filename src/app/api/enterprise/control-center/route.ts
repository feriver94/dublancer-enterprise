import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseControlCenterService } from "@/lib/services/enterprise-control-center.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiSuccess(await new EnterpriseControlCenterService().dashboard(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}
