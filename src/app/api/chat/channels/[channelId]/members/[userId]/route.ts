import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatChannelService } from "@/lib/services/chat-channel.service";
import { updateChatMemberSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string; userId: string }> };
const service = new ChatChannelService();

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId, userId } = await route.params;
    const input = updateChatMemberSchema.parse(await request.json());
    return apiSuccess(await service.updateMember(context, channelId, userId, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId, userId } = await route.params;
    return apiSuccess(await service.removeMember(context, channelId, userId));
  } catch (error) {
    return apiError(error);
  }
}
