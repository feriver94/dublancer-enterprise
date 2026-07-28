import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { AdaptiveAbuseService } from "@/lib/services/adaptive-abuse.service";
import { securityAdministrationSchema } from "@/lib/validation/phase7";

const service = new AdaptiveAbuseService();

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
    const input = securityAdministrationSchema.parse(await request.json());
    if (input.action !== "VERIFY_DEVICE_TOKEN") {
      return apiSuccess(await service.review(await getAuthenticatedContext(), input));
    }
    return apiSuccess(await service.verifyDevice(input.token));
  } catch (error) {
    return apiError(error);
  }
}
