import { z } from "zod";

const identifier = z.string().trim().min(1).max(191);
const userIds = z.array(identifier).max(100).default([]).transform((ids) => [...new Set(ids)]);

const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value), {
      message: "Text contains unsupported control characters.",
    });

const metadataSchema = z
  .record(z.string().max(120), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 8_192, {
    message: "Metadata must not exceed 8 KB.",
  })
  .optional();

export const createChatChannelSchema = z
  .object({
    type: z.enum(["PROJECT", "GROUP", "DIRECT", "ANNOUNCEMENT"]),
    visibility: z.enum(["PRIVATE", "PROJECT", "ORGANIZATION"]).default("PRIVATE"),
    projectId: identifier.optional(),
    name: safeText(2, 120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: safeText(1, 2_000).optional(),
    memberUserIds: userIds,
    retentionDays: z.number().int().min(1).max(3_650).optional(),
    metadata: metadataSchema,
  })
  .superRefine((value, context) => {
    if (value.type === "PROJECT") {
      if (!value.projectId) {
        context.addIssue({ code: "custom", path: ["projectId"], message: "Project channels require a projectId." });
      }
      if (value.visibility !== "PROJECT") {
        context.addIssue({ code: "custom", path: ["visibility"], message: "Project channels must use PROJECT visibility." });
      }
    } else if (value.projectId) {
      context.addIssue({ code: "custom", path: ["projectId"], message: "Only PROJECT channels can reference a project." });
    }

    if (value.type === "DIRECT") {
      if (value.memberUserIds.length !== 1) {
        context.addIssue({ code: "custom", path: ["memberUserIds"], message: "Direct channels require exactly one other member." });
      }
      if (value.visibility !== "PRIVATE") {
        context.addIssue({ code: "custom", path: ["visibility"], message: "Direct channels must be private." });
      }
    }

    if (["GROUP", "ANNOUNCEMENT"].includes(value.type) && !value.name) {
      context.addIssue({ code: "custom", path: ["name"], message: "Named channels require a name." });
    }
  });

export const listChatChannelsSchema = z.object({
  cursor: identifier.optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
  projectId: identifier.optional(),
  includeArchived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

export const updateChatChannelSchema = z
  .object({
    name: safeText(2, 120).nullable().optional(),
    description: safeText(1, 2_000).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3_650).nullable().optional(),
    isArchived: z.boolean().optional(),
    metadata: metadataSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one channel field must be provided.",
  });

export const addChatMemberSchema = z.object({
  userId: identifier,
  role: z.enum(["OWNER", "MODERATOR", "MEMBER"]).default("MEMBER"),
  notificationLevel: z.enum(["ALL", "MENTIONS", "NONE"]).default("ALL"),
});

export const updateChatMemberSchema = z
  .object({
    role: z.enum(["OWNER", "MODERATOR", "MEMBER"]).optional(),
    notificationLevel: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
    mutedUntil: z.coerce.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one member field must be provided.",
  });

export const createChatMessageSchema = z.object({
  body: safeText(1, 12_000),
  format: z.enum(["PLAIN_TEXT", "MARKDOWN"]).default("PLAIN_TEXT"),
  parentId: identifier.optional(),
  clientMessageId: z.string().uuid().optional(),
  mentionedUserIds: z.array(identifier).max(50).default([]).transform((ids) => [...new Set(ids)]),
});

export const listChatMessagesSchema = z.object({
  beforeSequence: z.coerce.bigint().positive().optional(),
  afterSequence: z.coerce.bigint().nonnegative().optional(),
  parentId: identifier.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateChatMessageSchema = z.object({
  body: safeText(1, 12_000),
  expectedVersion: z.number().int().positive(),
  reason: safeText(2, 240).optional(),
  mentionedUserIds: z.array(identifier).max(50).default([]).transform((ids) => [...new Set(ids)]),
});

export const markChatReadSchema = z.object({
  sequence: z.coerce.bigint().nonnegative(),
});

export const chatReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const chatTypingSchema = z.object({
  active: z.boolean(),
});

export const chatMaintenanceSchema = z.object({
  batchSize: z.number().int().min(1).max(2_000).default(500),
});

export type CreateChatChannelInput = z.infer<typeof createChatChannelSchema>;
export type ListChatChannelsInput = z.infer<typeof listChatChannelsSchema>;
export type UpdateChatChannelInput = z.infer<typeof updateChatChannelSchema>;
export type AddChatMemberInput = z.infer<typeof addChatMemberSchema>;
export type UpdateChatMemberInput = z.infer<typeof updateChatMemberSchema>;
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;
export type ListChatMessagesInput = z.infer<typeof listChatMessagesSchema>;
export type UpdateChatMessageInput = z.infer<typeof updateChatMessageSchema>;
