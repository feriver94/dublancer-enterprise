import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { SubscriptionAdministrationService } from "@/lib/services/subscription-administration.service";

const service = new SubscriptionAdministrationService();

export async function GET() {
  try {
    return apiSuccess(await service.plans(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}
