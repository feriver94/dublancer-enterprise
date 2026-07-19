import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { setNotificationStatus } from "@/lib/notifications/notification.service";
import { updateNotificationSchema } from "@/lib/validation/notifications";

export async function PATCH(request: NextRequest, context: { params: Promise<{ notificationId: string }> }) {
  try {
    await requireCsrfToken(request);
    const session = await getAuthenticatedContext();
    const { notificationId } = await context.params;
    const input = updateNotificationSchema.parse(await request.json());
    const status = input.action === "read" ? "READ" : input.action === "unread" ? "UNREAD" : "ARCHIVED";
    const notification = await setNotificationStatus(session, notificationId, status);
    return apiSuccess(notification);
  } catch (error) {
    return apiError(error);
  }
}
