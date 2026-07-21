import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AnalyticsAggregationService } from "@/lib/services/analytics-aggregation.service";
import { phase4AnalyticsBackfillSchema } from "@/lib/validation/phase4";

const service = new AnalyticsAggregationService();
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); return apiSuccess(await service.enqueueBackfill(await getAuthenticatedContext(), phase4AnalyticsBackfillSchema.parse(await request.json())), 202); }
  catch (error) { return apiError(error); }
}
