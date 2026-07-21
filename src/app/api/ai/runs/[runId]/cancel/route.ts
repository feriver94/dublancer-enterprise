import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { aiCancelSchema } from "@/lib/validation/phase5";

const service = new AiGovernanceService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try { await requireCsrfToken(request); const input = aiCancelSchema.parse(await request.json()); return apiSuccess(await service.cancel(await getAuthenticatedContext(), (await params).runId, input.reason)); }
  catch (error) { return apiError(error); }
}
