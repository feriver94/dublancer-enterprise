import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { NotificationService } from "@/lib/notifications/notification.service";

const service = new NotificationService();
type Context = { params: Promise<{ notificationId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { notificationId } = await route.params;
    return apiSuccess(
      await service.archive(context.userId, notificationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
