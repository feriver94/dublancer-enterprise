import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AnalyticsAggregationService } from "@/lib/services/analytics-aggregation.service";
import { phase4AnalyticsSummarySchema } from "@/lib/validation/phase4";

export const dynamic = "force-dynamic";
const service = new AnalyticsAggregationService();
export async function GET(request: NextRequest) {
  try { return apiSuccess(await service.summary(await getAuthenticatedContext(), phase4AnalyticsSummarySchema.parse(Object.fromEntries(request.nextUrl.searchParams)))); }
  catch (error) { return apiError(error); }
}
