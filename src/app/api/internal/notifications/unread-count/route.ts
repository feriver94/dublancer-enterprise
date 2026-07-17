import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { NotificationService } from "@/lib/notifications/notification.service";

const service = new NotificationService();

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    return apiSuccess(await service.unreadCount(context.userId));
  } catch (error) {
    return apiError(error);
  }
}
