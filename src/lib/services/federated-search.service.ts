import { createHash } from "node:crypto";
import { z } from "zod";
import { incrementMetric, observeMetric } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

const resultSchema = z.object({
  organizationId: z.string().min(1),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(191),
  title: z.string().min(1).max(500),
  body: z.string().max(20_000).default(""),
  locale: z.string().max(20).default("en-AE"),
  projectId: z.string().max(191).nullable().default(null),
  fileNodeId: z.string().max(191).nullable().default(null),
  requiredPermission: z.string().max(191).nullable().default(null),
  indexedAt: z.coerce.date(),
  rank: z.coerce.number().finite().min(0).max(1).default(0),
  highlight: z.string().max(5_000).default(""),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
});

function endpoints() {
  return (process.env.SEARCH_FEDERATION_ENDPOINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export type FederatedSearchInput = {
  organizationId: string;
  query: string;
  entityType?: string;
  locale?: string;
  take: number;
  permissions: string[];
  projectIds: string[];
  fileIds: string[];
  isPlatformAdmin?: boolean;
};

export async function federatedSearch(input: FederatedSearchInput) {
  const configured = endpoints();
  const token = process.env.SEARCH_FEDERATION_TOKEN;
  if (!configured.length || !token) return [];
  const timeout = Math.min(
    Math.max(Number(process.env.SEARCH_FEDERATION_TIMEOUT_MS ?? 800), 100),
    3_000,
  );
  const allowedProjects = new Set(input.projectIds);
  const allowedFiles = new Set(input.fileIds);
  const allowedPermissions = new Set(input.permissions);
  const results = await Promise.all(
    configured.map(async (endpoint) => {
      const started = performance.now();
      let provider = "unknown";
      try {
        const url = new URL(endpoint);
        provider = url.hostname;
        if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported federation protocol.");
        if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
          throw new Error("Production search federation requires HTTPS.");
        }
        const response = await fetch(url, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "user-agent": "Dublancer-Federated-Search/1.0",
          },
          body: JSON.stringify({
            organizationId: input.organizationId,
            query: input.query,
            entityType: input.entityType ?? "all",
            locale: input.locale ?? null,
            take: input.take,
          }),
        });
        if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
        const parsed = z.object({ items: z.array(resultSchema).max(100) }).parse(await response.json());
        incrementMetric("dublancer_search_federation_total", { provider, result: "success" });
        return parsed.items.filter((item) =>
          item.organizationId === input.organizationId &&
          (input.isPlatformAdmin || !item.requiredPermission || allowedPermissions.has(item.requiredPermission)) &&
          (input.isPlatformAdmin || !item.projectId || allowedProjects.has(item.projectId)) &&
          (input.isPlatformAdmin || !item.fileNodeId || allowedFiles.has(item.fileNodeId)) &&
          (!input.entityType || input.entityType === "all" || item.entityType === input.entityType.toUpperCase()) &&
          (!input.locale || item.locale === input.locale),
        ).map((item) => ({
          id: `federated-${createHash("sha256").update(`${provider}:${item.entityType}:${item.entityId}`).digest("base64url").slice(0, 32)}`,
          entityType: item.entityType,
          entityId: item.entityId,
          title: item.title,
          body: item.body,
          locale: item.locale,
          projectId: item.projectId,
          fileNodeId: item.fileNodeId,
          metadata: { ...(item.metadata ?? {}), federationProvider: provider },
          indexedAt: item.indexedAt,
          rank: item.rank,
          highlight: item.highlight,
        }));
      } catch (error) {
        incrementMetric("dublancer_search_federation_total", { provider, result: "failed" });
        logger.warn("search.federation_failed", { provider, error });
        return [];
      } finally {
        observeMetric("dublancer_search_duration_ms", performance.now() - started, {
          provider,
        });
      }
    }),
  );
  const unique = new Map<string, (typeof results)[number][number]>();
  for (const item of results.flat()) {
    const key = `${item.entityType}:${item.entityId}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()]
    .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
    .slice(0, input.take);
}
