import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { createNotification } from "@/lib/notifications/notification.service";
import { createNotificationSchema } from "@/lib/validation/notifications";
import { requireInternalHeader } from "@/lib/security/internal-auth";

export async function POST(request: NextRequest) {
  try {
    requireInternalHeader(
      request,
      "x-internal-notification-secret",
      "INTERNAL_NOTIFICATION_SECRET",
    );
    const input = createNotificationSchema.parse(await request.json());
    return apiSuccess(await createNotification(input), 201);
  } catch (error) {
    return apiError(error);
  }
}
