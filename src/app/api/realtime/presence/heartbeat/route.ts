import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { presenceHeartbeatSchema } from "@/lib/validation/realtime";
import { PresenceService } from "@/lib/realtime/presence.service";

const service = new PresenceService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = presenceHeartbeatSchema.parse(
      await request.json(),
    );

    return apiSuccess(
      await service.heartbeat(context, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
