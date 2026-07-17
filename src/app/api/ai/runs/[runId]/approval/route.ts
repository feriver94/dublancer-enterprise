import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiRunService } from "@/lib/services/product-platform.service";
import { aiDecisionSchema } from "@/lib/validation/product";

const service = new AiRunService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "ai.manage"); return apiSuccess(await service.decide(context, (await params).runId, aiDecisionSchema.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}
