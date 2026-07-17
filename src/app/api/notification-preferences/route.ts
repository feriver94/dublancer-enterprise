import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateNotificationPreferenceSchema } from "@/lib/validation/notifications";
import { NotificationPreferenceService } from "@/lib/notifications/preferences.service";

const service = new NotificationPreferenceService();

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    return apiSuccess(
      await service.list(
        context.userId,
        context.organizationId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input =
      updateNotificationPreferenceSchema.parse(
        await request.json(),
      );

    return apiSuccess(
      await service.upsert(
        context.userId,
        context.organizationId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
