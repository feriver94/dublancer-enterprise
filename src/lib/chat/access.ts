import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/policy-engine";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import type { TenantContext } from "@/lib/tenancy/context";

export type ChatAccessAction = "READ" | "POST" | "MANAGE";

export async function requireChatChannelAccess(
  context: TenantContext,
  channelId: string,
  action: ChatAccessAction,
) {
  await requirePermission(
    context,
    action === "READ"
      ? "chat.read"
      : action === "POST"
        ? "chat.message.create"
        : "chat.moderate",
  );

  const channel = await prisma.chatChannel.findFirst({
    where: {
      id: channelId,
      organizationId: context.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      type: true,
      visibility: true,
      isArchived: true,
      sequence: true,
      members: {
        where: { userId: context.userId, isActive: true },
        select: { id: true, role: true, notificationLevel: true },
        take: 1,
      },
    },
  });

  if (!channel) {
    throw new AppError("NOT_FOUND", "Chat channel not found.", 404);
  }

  const member = channel.members[0] ?? null;

  if (!context.isPlatformAdmin && !member) {
    if (channel.visibility === "PRIVATE") {
      throw new AppError("FORBIDDEN", "Channel membership is required.", 403);
    }

    if (channel.visibility === "PROJECT") {
      if (!channel.projectId) {
        throw new AppError("FORBIDDEN", "Invalid project channel configuration.", 403);
      }
      await requireProjectAccess(context, channel.projectId, [
        "OWNER",
        "MANAGER",
        "CONTRIBUTOR",
        "VIEWER",
      ]);
    }
  }

  if (action === "POST" && channel.isArchived) {
    throw new AppError("CONFLICT", "Archived channels are read-only.", 409);
  }

  if (
    action === "POST" &&
    channel.type === "ANNOUNCEMENT" &&
    !context.isPlatformAdmin &&
    !["OWNER", "MODERATOR"].includes(member?.role ?? "")
  ) {
    throw new AppError("FORBIDDEN", "Only channel moderators can post announcements.", 403);
  }

  if (
    action === "MANAGE" &&
    !context.isPlatformAdmin &&
    !["OWNER", "MODERATOR"].includes(member?.role ?? "")
  ) {
    throw new AppError("FORBIDDEN", "Channel moderator access is required.", 403);
  }

  return { channel, member };
}
