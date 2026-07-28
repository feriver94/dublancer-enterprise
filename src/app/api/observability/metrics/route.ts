import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http/api-response";
import { prometheusMetrics } from "@/lib/observability/metrics";
import { requireInternalSecret } from "@/lib/security/internal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireInternalSecret(request, "OBSERVABILITY_EXPORT_SECRET");
    return new Response(prometheusMetrics(), {
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
