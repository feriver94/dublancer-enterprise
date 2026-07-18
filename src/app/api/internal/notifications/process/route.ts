import { apiError, apiSuccess } from "@/lib/http/api-response";
import { processNotificationDeliveries } from "@/lib/notifications/delivery-worker";
import { requireInternalHeader } from "@/lib/security/internal-auth";

export async function POST(request: Request) {
  try {
    requireInternalHeader(
      request,
      "x-internal-notification-secret",
      "INTERNAL_NOTIFICATION_SECRET",
    );

    return apiSuccess(await processNotificationDeliveries());
  } catch (error) {
    return apiError(error);
  }
}
