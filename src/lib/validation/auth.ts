import { z } from "zod";
export const registerSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  displayName: z.string().min(2).max(120),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
});
export const loginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(1).max(128),
  organizationId: z.string().optional(),
  deviceLabel: z.string().max(120).optional(),
});
export const refreshSchema = z.object({ organizationId: z.string().optional() });
