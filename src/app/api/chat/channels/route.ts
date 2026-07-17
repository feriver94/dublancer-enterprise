import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { ChatChannelService } from "@/lib/services/chat-channel.service";
import { createChatChannelSchema, listChatChannelsSchema } from "@/lib/validation/chat";

export const dynamic = "force-dynamic";
const service = new ChatChannelService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const query = listChatChannelsSchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
      projectId: request.nextUrl.searchParams.get("projectId") ?? undefined,
      includeArchived: request.nextUrl.searchParams.get("includeArchived") ?? undefined,
    });
    const result = await service.list(context, query);
    return apiSuccess(result.items, 200, { nextCursor: result.nextCursor });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = createChatChannelSchema.parse(await request.json());
    return apiSuccess(await service.create(context, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
