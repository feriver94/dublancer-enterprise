import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatMessageService } from "@/lib/services/chat-message.service";
import { markChatReadSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string }> };
const service = new ChatMessageService();

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    const { sequence } = markChatReadSchema.parse(await request.json());
    return apiSuccess(await service.markRead(context, channelId, sequence));
  } catch (error) {
    return apiError(error);
  }
}
