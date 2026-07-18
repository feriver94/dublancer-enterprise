import { apiError, apiSuccess } from "@/lib/http/api-response";
import { publishPendingRealtimeEvents } from "@/lib/realtime/publisher";
import { requireInternalHeader } from "@/lib/security/internal-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireInternalHeader(
      request,
      "x-internal-publisher-secret",
      "INTERNAL_PUBLISHER_SECRET",
    );

    return apiSuccess(
      await publishPendingRealtimeEvents(),
    );
  } catch (error) {
    return apiError(error);
  }
}
