import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PhaseCAiAssistanceService } from "@/lib/services/phase-c-ai-assistance.service";
import { aiProfileAssistanceSchema } from "@/lib/validation/phase-c";

export const dynamic = "force-dynamic";
const service = new PhaseCAiAssistanceService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    return apiSuccess(await service.request(await getAuthenticatedContext(), aiProfileAssistanceSchema.parse(await request.json())), 202);
  } catch (error) {
    return apiError(error);
  }
}
