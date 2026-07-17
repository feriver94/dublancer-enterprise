import { createHash } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";

export async function enforceRateLimit(input: { scope: string; identifier: string; limit: number; windowMs: number; organizationId?: string }) {
  const now = new Date();
  const key = createHash("sha256").update(`${input.scope}:${input.identifier}`).digest("hex");
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const current = await prisma.rateLimitBucket.findUnique({ where: { key }, select: { count: true, expiresAt: true } });
  if (!current || current.expiresAt <= now) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, organizationId: input.organizationId, count: 1, windowStart: now, expiresAt },
      update: { organizationId: input.organizationId, count: 1, windowStart: now, expiresAt },
    });
    return { remaining: input.limit - 1, expiresAt };
  }
  const updated = await prisma.rateLimitBucket.updateMany({ where: { key, expiresAt: { gt: now }, count: { lt: input.limit } }, data: { count: { increment: 1 } } });
  if (updated.count !== 1) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429, { retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)) });
  return { remaining: Math.max(0, input.limit - current.count - 1), expiresAt: current.expiresAt };
}
