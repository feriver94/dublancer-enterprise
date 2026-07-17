import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatChannelService } from "@/lib/services/chat-channel.service";
import { updateChatChannelSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string }> };
const service = new ChatChannelService();

export async function GET(_request: NextRequest, route: RouteContext) {
  try {
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    return apiSuccess(await service.get(context, channelId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    const input = updateChatChannelSchema.parse(await request.json());
    return apiSuccess(await service.update(context, channelId, input));
  } catch (error) {
    return apiError(error);
  }
}
