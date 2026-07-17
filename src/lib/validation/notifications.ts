import { z } from "zod";

export const notificationListSchema = z.object({
  status: z.enum(["UNREAD", "READ", "ARCHIVED"]).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export const createNotificationSchema = z.object({
  userId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).default("GENERAL"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().max(4000).optional(),
  actionUrl: z.string().trim().max(2048).optional(),
  dedupeKey: z.string().trim().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.coerce.date().optional(),
  channels: z
    .array(z.enum(["IN_APP", "EMAIL", "PUSH", "SMS"]))
    .min(1)
    .default(["IN_APP"]),
});

export const updateNotificationPreferenceSchema = z.object({
  category: z.string().trim().min(1).max(80),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH", "SMS"]),
  enabled: z.boolean(),
  quietHours: z.record(z.string(), z.unknown()).optional(),
  locale: z.enum(["en-AE", "ar-AE"]).optional(),
});

export const updateNotificationSchema = z.object({
  action: z.enum(["read", "unread", "archive"]),
});
