import { redis } from "@/lib/realtime/redis";
import { AppError } from "@/lib/errors/app-error";

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
  const result = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    input.windowMs,
  )) as [number, number];

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
  };
}
