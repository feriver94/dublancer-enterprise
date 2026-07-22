import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { Phase6ContractService } from "@/lib/services/phase6-contract.service";
import { amendmentDecisionSchema } from "@/lib/validation/phase6";
const service = new Phase6ContractService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contractId: string; amendmentId: string }> }) {
  try { await requireCsrfToken(request); const ids = await params; return apiSuccess(await service.decideAmendment(await getAuthenticatedContext(), ids.contractId, ids.amendmentId, amendmentDecisionSchema.parse(await request.json()))); } catch (error) { return apiError(error); }
}
