import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { NotificationService } from "@/lib/notifications/notification.service";

const service = new NotificationService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    return apiSuccess(await service.markAllRead(context.userId));
  } catch (error) {
    return apiError(error);
  }
}
