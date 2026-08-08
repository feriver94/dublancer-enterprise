import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileDashboardService } from "@/lib/services/profile-dashboard.service";

export const dynamic = "force-dynamic";
const service = new ProfileDashboardService();

export async function GET() {
  try {
    return apiSuccess(await service.client(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}
