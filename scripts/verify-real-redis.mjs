import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) throw new Error("REDIS_URL is required for real Redis verification.");

const options = {
  connectTimeout: 2_000,
  commandTimeout: 2_000,
  maxRetriesPerRequest: 1,
  retryStrategy: null,
};
const publisher = new Redis(redisUrl, options);
const subscriber = new Redis(redisUrl, options);
publisher.on("error", () => undefined);
subscriber.on("error", () => undefined);

const runId = randomUUID();
const prefix = `dublancer:release-certification:${runId}`;
const keys = {
  cache: `${prefix}:cache`,
  presence: `${prefix}:presence`,
  chat: `${prefix}:chat`,
  notifications: `${prefix}:notifications`,
  queue: `${prefix}:queue`,
  rateLimit: `${prefix}:rate-limit`,
};
const channel = `${prefix}:pubsub`;

try {
  assert.equal(await publisher.ping(), "PONG");
  for (const [capability, key] of Object.entries(keys).filter(([name]) => name !== "rateLimit")) {
    await publisher.set(key, capability, "EX", 60);
    assert.equal(await publisher.get(key), capability);
  }
  await publisher.set(keys.rateLimit, "0", "EX", 60);
  assert.equal(await publisher.incr(keys.rateLimit), 1);
  assert.ok(await publisher.ttl(keys.rateLimit) > 0);
  assert.ok(await publisher.ttl(keys.cache) > 0);

  const delivered = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Real Redis pub/sub delivery timed out.")), 3_000);
    subscriber.once("message", (receivedChannel, payload) => {
      clearTimeout(timeout);
      resolve({ receivedChannel, payload });
    });
  });
  await subscriber.subscribe(channel);
  assert.equal(await publisher.publish(channel, "release-certification"), 1);
  assert.deepEqual(await delivered, { receivedChannel: channel, payload: "release-certification" });
  await subscriber.unsubscribe(channel);
  await publisher.del(...Object.values(keys));

  const info = await publisher.info("server");
  const version = info.match(/^redis_version:([^\r\n]+)/m)?.[1] ?? "unknown";
  console.log(JSON.stringify({
    result: "PASS",
    redisVersion: version,
    verified: ["health", "pub/sub", "presence keyspace", "chat keyspace", "notifications keyspace", "queue keyspace", "rate-limit counters", "cache TTL and cleanup"],
  }, null, 2));
} finally {
  await Promise.allSettled([subscriber.quit(), publisher.quit()]);
}
