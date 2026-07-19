import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PresenceService } from "@/lib/realtime/presence.service";

const service = new PresenceService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const channelId = request.nextUrl.searchParams.get("channelId")?.trim();
    if (!channelId) {
      return apiSuccess([]);
    }
    return apiSuccess(await service.listChatPresence(context, channelId));
  } catch (error) {
    return apiError(error);
  }
}
