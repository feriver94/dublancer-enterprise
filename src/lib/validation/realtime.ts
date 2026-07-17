import { z } from "zod";

export const presenceHeartbeatSchema = z.object({
  connectionId: z.string().uuid().optional(),
  projectId: z.string().min(1).optional(),
  resourceType: z.string().min(1).max(120).optional(),
  resourceId: z.string().min(1).max(240).optional(),
  status: z.enum(["ONLINE", "AWAY"]).default("ONLINE"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const disconnectPresenceSchema = z.object({
  connectionId: z.string().uuid(),
});
