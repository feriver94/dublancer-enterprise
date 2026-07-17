import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { createNotificationSchema } from "@/lib/validation/notifications";
import { NotificationService } from "@/lib/notifications/notification.service";

const service = new NotificationService();

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-internal-notification-secret");

    if (
      !process.env.INTERNAL_NOTIFICATION_SECRET ||
      secret !== process.env.INTERNAL_NOTIFICATION_SECRET
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const input = createNotificationSchema.parse(
      await request.json(),
    );

    return apiSuccess(await service.create(input), 201);
  } catch (error) {
    return apiError(error);
  }
}
