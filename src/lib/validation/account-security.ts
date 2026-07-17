import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
});

export const tokenSchema = z.object({
  token: z.string().min(32),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12).max(128)
    .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
});
