import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";

const service = new AiGovernanceService();
export async function GET(request: NextRequest) {
  try {
    return apiSuccess(await service.audit(await getAuthenticatedContext(), {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: Number(request.nextUrl.searchParams.get("take") ?? 100),
    }));
  } catch (error) { return apiError(error); }
}
