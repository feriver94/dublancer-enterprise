import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatChannelService } from "@/lib/services/chat-channel.service";
import { addChatMemberSchema } from "@/lib/validation/chat";

type RouteContext = { params: Promise<{ channelId: string }> };
const service = new ChatChannelService();

export async function GET(_request: NextRequest, route: RouteContext) {
  try {
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    return apiSuccess(await service.listMembers(context, channelId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { channelId } = await route.params;
    const input = addChatMemberSchema.parse(await request.json());
    return apiSuccess(await service.addMember(context, channelId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
