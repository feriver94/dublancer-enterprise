import { redis, runRedisOperation } from "@/lib/realtime/redis";
import { AppError } from "@/lib/errors/app-error";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

export async function enforceChatRateLimit(input: {
  scope: string;
  userId: string;
  channelId: string;
  limit: number;
  windowMs: number;
}) {
  const key = `ratelimit:chat:${input.scope}:${input.channelId}:${input.userId}`;
  let result: [number, number];
  try {
    result = (await runRedisOperation(redis, () => redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      input.windowMs,
    ))) as [number, number];
  } catch {
    const fallback = await enforceRateLimit({
      scope: `chat.${input.scope}`,
      identifier: `${input.channelId}:${input.userId}`,
      limit: input.limit,
      windowMs: input.windowMs,
    });
    return {
      limit: input.limit,
      remaining: fallback.remaining,
      resetAfterMs: Math.max(fallback.expiresAt.getTime() - Date.now(), 0),
      backend: "database" as const,
    };
  }

  const [count, ttl] = result;
  if (count > input.limit) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many chat requests. Please retry shortly.",
      429,
      { retryAfterMs: Math.max(ttl, 1_000) },
    );
  }

  return {
    limit: input.limit,
    remaining: Math.max(input.limit - count, 0),
    resetAfterMs: Math.max(ttl, 0),
    backend: "redis" as const,
  };
}
