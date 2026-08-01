import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformReliabilityService } from "@/lib/services/platform-reliability.service";

export const dynamic = "force-dynamic";
const service = new PlatformReliabilityService();

export async function GET() {
  try {
    return apiSuccess(
      await service.capacityReport(await getAuthenticatedContext()),
    );
  } catch (error) {
    return apiError(error);
  }
}
