import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
  redisSubscriber?: Redis;
};

function createRedisClient() {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error("REDIS_URL environment variable is not configured.");
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 1_000,
    commandTimeout: 1_200,
    retryStrategy(times) {
      return times <= 2 ? Math.min(times * 100, 250) : null;
    },
  });
  // ioredis treats an unobserved error event as an application-level warning.
  // Callers receive failures through their awaited commands and apply bounded
  // fallbacks, so the shared client observes the event without duplicating it.
  client.on("error", () => undefined);
  return client;
}

export async function runRedisOperation<T>(
  client: Redis,
  operation: () => Promise<T>,
  timeoutMs = 1_500,
): Promise<T> {
  const bounded = <Value>(promise: Promise<Value>) =>
    new Promise<Value>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Redis operation timed out.")),
        timeoutMs,
      );
      promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });

  if (client.status === "wait" || client.status === "end") {
    await bounded(client.connect());
  }

  return bounded(operation());
}

export async function pingRedis(): Promise<boolean> {
  try {
    return await runRedisOperation(redis, () => redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

export const redis =
  globalForRedis.redis ?? createRedisClient();

export const redisSubscriber =
  globalForRedis.redisSubscriber ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSubscriber = redisSubscriber;
}
