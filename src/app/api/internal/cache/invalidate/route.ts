import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalHeader } from "@/lib/security/internal-auth";
import { distributedCache } from "@/lib/cache/distributed-cache";
import { withRequestSpan } from "@/lib/observability/telemetry";

const schema = z.object({
  organizationId: z.string().trim().min(1).max(191),
  sourceRegion: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    return await withRequestSpan(
      "cache.remote_invalidation",
      request,
      { "http.route": "/api/internal/cache/invalidate" },
      async () => {
        requireInternalHeader(
          request,
          "x-cache-invalidation-secret",
          "CACHE_INVALIDATION_SECRET",
        );
        const input = schema.parse(await request.json());
        await distributedCache.invalidateTenant(input.organizationId, {
          propagate: false,
          reason: input.reason,
        });
        return apiSuccess({
          invalidated: true,
          organizationId: input.organizationId,
          sourceRegion: input.sourceRegion,
          region: process.env.DEPLOYMENT_REGION ?? "unknown",
        });
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
