import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalSecret } from "@/lib/security/internal-auth";
import { PlatformReliabilityService } from "@/lib/services/platform-reliability.service";
import { withRequestSpan } from "@/lib/observability/telemetry";

const service = new PlatformReliabilityService();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("EVALUATE_SLOS") }),
  z.object({ action: z.literal("EVALUATE_SCALING") }),
  z.object({
    action: z.literal("DELIVER_ALERTS"),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("COMPLETE_LOAD_TEST"),
    runId: z.string().min(1),
    status: z.enum(["PASSED", "FAILED", "CANCELLED"]),
    requests: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    p50LatencyMs: z.number().int().nonnegative().optional(),
    p95LatencyMs: z.number().int().nonnegative().optional(),
    p99LatencyMs: z.number().int().nonnegative().optional(),
    maxLatencyMs: z.number().int().nonnegative().optional(),
    report: z.unknown().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    return await withRequestSpan(
      "observability.evaluate",
      request,
      { "http.route": "/api/internal/observability/evaluate" },
      async () => {
        requireInternalSecret(request, "INTERNAL_WORKER_SECRET");
        const input = schema.parse(await request.json());
        if (input.action === "EVALUATE_SLOS") {
          return apiSuccess(await service.evaluateObjectives(), 202);
        }
        if (input.action === "EVALUATE_SCALING") {
          return apiSuccess(await service.evaluateScaling(), 202);
        }
        if (input.action === "DELIVER_ALERTS") {
          return apiSuccess(await service.deliverAlerts(input.limit), 202);
        }
        const { action: _, ...data } = input;
        return apiSuccess(await service.completeLoadTest(data), 202);
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
