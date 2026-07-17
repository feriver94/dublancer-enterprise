import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { createSseResponse } from "@/lib/realtime/sse";
import { REALTIME_TOPICS } from "@/lib/realtime/topics";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { requireChatChannelAccess } from "@/lib/chat/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const projectId =
      request.nextUrl.searchParams.get("projectId");
    const channelId =
      request.nextUrl.searchParams.get("channelId");

    const topics = [
      REALTIME_TOPICS.user(context.userId),
      REALTIME_TOPICS.organization(
        context.organizationId,
      ),
    ];

    if (projectId) {
      await requireProjectAccess(
        context,
        projectId,
        ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"],
      );
      topics.push(REALTIME_TOPICS.project(projectId));
    }

    if (channelId) {
      await requireChatChannelAccess(context, channelId, "READ");
      topics.push(REALTIME_TOPICS.chatChannel(channelId));
    }

    return createSseResponse(
      topics,
      request.signal,
    );
  } catch (error) {
    return apiError(error);
  }
}
