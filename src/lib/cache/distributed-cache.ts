import { createHash } from "node:crypto";
import {
  incrementMetric,
  observeMetric,
} from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

type LocalEntry = {
  value: string;
  expiresAt: number;
};

const globalCache = globalThis as unknown as {
  dublancerLocalCache?: Map<string, LocalEntry>;
  dublancerCacheCircuit?: {
    failures: number;
    openUntil: number;
  };
};
const local =
  globalCache.dublancerLocalCache ?? new Map<string, LocalEntry>();
const circuit =
  globalCache.dublancerCacheCircuit ?? { failures: 0, openUntil: 0 };
globalCache.dublancerLocalCache = local;
globalCache.dublancerCacheCircuit = circuit;

const maxLocalEntries = 2_000;

function namespace(organizationId: string | null, key: string) {
  const environment =
    process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
  return `dublancer:${environment}:v1:${organizationId ?? "global"}:${key}`;
}

function trimLocalCache() {
  const now = Date.now();
  for (const [key, value] of local) {
    if (value.expiresAt <= now) local.delete(key);
  }
  while (local.size > maxLocalEntries) {
    const oldest = local.keys().next().value as string | undefined;
    if (!oldest) break;
    local.delete(oldest);
  }
}

async function redisClient() {
  if (
    process.env.CACHE_FORCE_PRIMARY_FAILURE === "1" ||
    circuit.openUntil > Date.now()
  ) {
    throw new Error("Distributed cache circuit is open.");
  }
  const { redis, runRedisOperation } = await import("@/lib/realtime/redis");
  return { redis, runRedisOperation };
}

function primaryFailure(error: unknown) {
  circuit.failures += 1;
  if (circuit.failures >= 3) {
    circuit.openUntil = Date.now() + 30_000;
  }
  incrementMetric("dublancer_cache_failover_total");
  logger.warn("cache.primary_unavailable", {
    error,
    failures: circuit.failures,
    openUntil: circuit.openUntil || null,
  });
}

function primarySuccess() {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

function invalidationPeers() {
  return (process.env.CACHE_INVALIDATION_PEERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function propagateInvalidation(organizationId: string, reason: string) {
  const secret = process.env.CACHE_INVALIDATION_SECRET;
  const peers = invalidationPeers();
  if (!peers.length) return [];
  if (!secret || secret.length < 32) {
    logger.error("cache.invalidation_not_configured", { peers: peers.length });
    incrementMetric("dublancer_cache_invalidations_total", {
      result: "failed",
      scope: "regional",
    });
    return peers.map((endpoint) => ({ endpoint, status: "not_configured" }));
  }
  const sourceRegion = process.env.DEPLOYMENT_REGION ?? "unknown";
  return Promise.all(
    peers.map(async (endpoint) => {
      const started = performance.now();
      let destinationRegion = "unknown";
      try {
        const url = new URL(endpoint);
        destinationRegion = url.hostname;
        if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported invalidation protocol.");
        if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
          throw new Error("Production invalidation peers require HTTPS.");
        }
        const response = await fetch(url, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(1_500),
          headers: {
            "content-type": "application/json",
            "x-cache-invalidation-secret": secret,
            "user-agent": "Dublancer-Cache-Invalidation/1.0",
          },
          body: JSON.stringify({ organizationId, sourceRegion, reason }),
        });
        if (!response.ok) throw new Error(`Invalidation peer returned HTTP ${response.status}.`);
        incrementMetric("dublancer_cache_invalidations_total", {
          result: "success",
          scope: "regional",
        });
        return { endpoint, status: "delivered" };
      } catch (error) {
        incrementMetric("dublancer_cache_invalidations_total", {
          result: "failed",
          scope: "regional",
        });
        logger.warn("cache.invalidation_peer_failed", {
          destinationRegion,
          error,
        });
        return { endpoint, status: "failed" };
      } finally {
        observeMetric(
          "dublancer_cache_invalidation_duration_ms",
          performance.now() - started,
          { destination_region: destinationRegion },
        );
      }
    }),
  );
}

export class DistributedCache {
  async get<T>(organizationId: string | null, key: string): Promise<T | null> {
    const started = performance.now();
    const namespaced = namespace(organizationId, key);
    try {
      const { redis, runRedisOperation } = await redisClient();
      const raw = await runRedisOperation(redis, () => redis.get(namespaced), 600);
      primarySuccess();
      if (raw) {
        incrementMetric("dublancer_cache_operations_total", {
          operation: "get",
          result: "hit",
          tier: "redis",
        });
        return JSON.parse(raw) as T;
      }
      incrementMetric("dublancer_cache_operations_total", {
        operation: "get",
        result: "miss",
        tier: "redis",
      });
    } catch (error) {
      primaryFailure(error);
    } finally {
      observeMetric(
        "dublancer_cache_operation_duration_ms",
        performance.now() - started,
        { operation: "get" },
      );
    }
    const fallback = local.get(namespaced);
    if (!fallback || fallback.expiresAt <= Date.now()) {
      local.delete(namespaced);
      incrementMetric("dublancer_cache_operations_total", {
        operation: "get",
        result: "miss",
        tier: "local",
      });
      return null;
    }
    local.delete(namespaced);
    local.set(namespaced, fallback);
    incrementMetric("dublancer_cache_operations_total", {
      operation: "get",
      result: "hit",
      tier: "local",
    });
    return JSON.parse(fallback.value) as T;
  }

  async set(
    organizationId: string | null,
    key: string,
    value: unknown,
    ttlSeconds: number,
  ) {
    const namespaced = namespace(organizationId, key);
    const raw = JSON.stringify(value);
    const ttl = Math.min(Math.max(ttlSeconds, 1), 86_400);
    local.set(namespaced, {
      value: raw,
      expiresAt: Date.now() + ttl * 1_000,
    });
    trimLocalCache();
    try {
      const { redis, runRedisOperation } = await redisClient();
      await runRedisOperation(
        redis,
        () => redis.set(namespaced, raw, "EX", ttl),
        600,
      );
      primarySuccess();
      incrementMetric("dublancer_cache_operations_total", {
        operation: "set",
        result: "success",
        tier: "redis",
      });
    } catch (error) {
      primaryFailure(error);
      incrementMetric("dublancer_cache_operations_total", {
        operation: "set",
        result: "fallback",
        tier: "local",
      });
    }
  }

  async delete(organizationId: string | null, key: string) {
    const namespaced = namespace(organizationId, key);
    local.delete(namespaced);
    try {
      const { redis, runRedisOperation } = await redisClient();
      await runRedisOperation(redis, () => redis.del(namespaced), 600);
      primarySuccess();
    } catch (error) {
      primaryFailure(error);
    }
  }

  async invalidateTenant(
    organizationId: string,
    options: { propagate?: boolean; reason?: string } = {},
  ) {
    const prefix = namespace(organizationId, "");
    for (const key of local.keys()) {
      if (key.startsWith(prefix)) local.delete(key);
    }
    try {
      const { redis, runRedisOperation } = await redisClient();
      let cursor = "0";
      do {
        const [next, keys] = await runRedisOperation(
          redis,
          () => redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 250),
          1_000,
        );
        cursor = next;
        if (keys.length) {
          await runRedisOperation(redis, () => redis.del(...keys), 1_000);
        }
      } while (cursor !== "0");
      primarySuccess();
    } catch (error) {
      primaryFailure(error);
    }
    incrementMetric("dublancer_cache_invalidations_total", {
      scope: "tenant",
      result: "success",
    });
    return options.propagate === false
      ? []
      : propagateInvalidation(
          organizationId,
          options.reason ?? "tenant_mutation",
        );
  }

  async getOrSet<T>(
    organizationId: string | null,
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ) {
    const cached = await this.get<T>(organizationId, key);
    if (cached !== null) return { value: cached, cache: "hit" as const };
    const value = await loader();
    await this.set(organizationId, key, value, ttlSeconds);
    return { value, cache: "miss" as const };
  }

  health() {
    return {
      strategy: "redis-primary-local-lru-fallback",
      circuitOpen: circuit.openUntil > Date.now(),
      circuitOpenUntil: circuit.openUntil || null,
      consecutiveFailures: circuit.failures,
      localEntries: local.size,
      keyspaceVersion: "v1",
      region: process.env.DEPLOYMENT_REGION ?? "unknown",
      invalidationPeers: invalidationPeers().length,
    };
  }

  key(input: unknown) {
    return createHash("sha256")
      .update(JSON.stringify(input))
      .digest("base64url");
  }
}

export const distributedCache = new DistributedCache();
