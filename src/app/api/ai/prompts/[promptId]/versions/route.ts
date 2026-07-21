import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { aiPromptVersionSchema } from "@/lib/validation/phase5";

const service = new AiGovernanceService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ promptId: string }> }) {
  try { await requireCsrfToken(request); return apiSuccess(await service.createPromptVersion(await getAuthenticatedContext(), (await params).promptId, aiPromptVersionSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
