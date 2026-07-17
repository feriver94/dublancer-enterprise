export const REALTIME_TOPICS = {
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
  organization: (organizationId: string) =>
    `organization:${organizationId}`,
  chatChannel: (channelId: string) => `chat:channel:${channelId}`,
} as const;

export const REALTIME_EVENTS = {
  PROJECT_TASK_CREATED: "project.task.created",
  PROJECT_TASK_UPDATED: "project.task.updated",
  PROJECT_COMMENT_CREATED: "project.comment.created",
  PROJECT_MILESTONE_CREATED: "project.milestone.created",
  PROJECT_MEMBER_UPDATED: "project.member.updated",
  NOTIFICATION_CREATED: "notification.created",
  PRESENCE_UPDATED: "presence.updated",
  CHAT_CHANNEL_CREATED: "chat.channel.created",
  CHAT_CHANNEL_UPDATED: "chat.channel.updated",
  CHAT_MEMBER_UPDATED: "chat.member.updated",
  CHAT_MESSAGE_CREATED: "chat.message.created",
  CHAT_MESSAGE_UPDATED: "chat.message.updated",
  CHAT_MESSAGE_DELETED: "chat.message.deleted",
  CHAT_REACTION_UPDATED: "chat.reaction.updated",
  CHAT_READ_UPDATED: "chat.read.updated",
  CHAT_TYPING_UPDATED: "chat.typing.updated",
} as const;
