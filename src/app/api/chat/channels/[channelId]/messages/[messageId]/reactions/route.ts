import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatMessageService } from "@/lib/services/chat-message.service";
import { chatReactionSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string; messageId: string }> };
const service = new ChatMessageService();

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId, messageId } = await route.params;
    const { emoji } = chatReactionSchema.parse(await request.json());
    return apiSuccess(await service.addReaction(context, channelId, messageId, emoji), 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId, messageId } = await route.params;
    const { emoji } = chatReactionSchema.parse(await request.json());
    return apiSuccess(await service.removeReaction(context, channelId, messageId, emoji));
  } catch (error) {
    return apiError(error);
  }
}
