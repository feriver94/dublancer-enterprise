import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { SubscriptionAdministrationService } from "@/lib/services/subscription-administration.service";
import { subscriptionLifecycleSchema } from "@/lib/validation/phase7";

const service = new SubscriptionAdministrationService();

export async function GET() {
  try {
    return apiSuccess(await service.dashboard(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = subscriptionLifecycleSchema.parse(await request.json());
    return apiSuccess(await service.transition(context, input));
  } catch (error) {
    return apiError(error);
  }
}
