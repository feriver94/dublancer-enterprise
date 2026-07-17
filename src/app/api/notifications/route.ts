import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { notificationListSchema } from "@/lib/validation/notifications";
import { NotificationService } from "@/lib/notifications/notification.service";

const service = new NotificationService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const input = notificationListSchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
    });

    const result = await service.list(context.userId, input);
    return apiSuccess(result.items, 200, {
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return apiError(error);
  }
}
