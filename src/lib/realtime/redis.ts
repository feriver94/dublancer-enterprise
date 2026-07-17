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

  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 100, 3000);
    },
  });
}

export const redis =
  globalForRedis.redis ?? createRedisClient();

export const redisSubscriber =
  globalForRedis.redisSubscriber ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSubscriber = redisSubscriber;
}
