import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { aiApprovalListSchema } from "@/lib/validation/phase5";

export const dynamic = "force-dynamic";
const service = new AiGovernanceService();
export async function GET(request: NextRequest) {
  try { return apiSuccess(await service.approvals(await getAuthenticatedContext(), aiApprovalListSchema.parse(Object.fromEntries(request.nextUrl.searchParams)))); }
  catch (error) { return apiError(error); }
}
