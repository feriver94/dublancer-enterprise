import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatMessageService } from "@/lib/services/chat-message.service";
import { createChatMessageSchema, listChatMessagesSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string }> };
const service = new ChatMessageService();

export async function GET(request: NextRequest, route: RouteContext) {
  try {
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    const query = listChatMessagesSchema.parse({
      beforeSequence: request.nextUrl.searchParams.get("beforeSequence") ?? undefined,
      afterSequence: request.nextUrl.searchParams.get("afterSequence") ?? undefined,
      parentId: request.nextUrl.searchParams.get("parentId") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
    });
    const result = await service.list(context, channelId, query);
    return apiSuccess(result.items, 200, {
      nextSequence: result.nextSequence,
      direction: result.direction,
      channelSequence: result.channelSequence,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    const input = createChatMessageSchema.parse(await request.json());
    return apiSuccess(await service.create(context, channelId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
