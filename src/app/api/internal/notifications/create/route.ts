import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { createNotificationSchema } from "@/lib/validation/notifications";
import { NotificationService } from "@/lib/notifications/notification.service";
import { requireInternalHeader } from "@/lib/security/internal-auth";

const service = new NotificationService();

export async function POST(request: NextRequest) {
  try {
    requireInternalHeader(
      request,
      "x-internal-notification-secret",
      "INTERNAL_NOTIFICATION_SECRET",
    );

    const input = createNotificationSchema.parse(
      await request.json(),
    );

    return apiSuccess(await service.create(input), 201);
  } catch (error) {
    return apiError(error);
  }
}
