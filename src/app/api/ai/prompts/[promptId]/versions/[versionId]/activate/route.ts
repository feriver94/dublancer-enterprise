import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";

const service = new AiGovernanceService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ promptId: string; versionId: string }> }) {
  try { await requireCsrfToken(request); const input = await params; return apiSuccess(await service.activatePromptVersion(await getAuthenticatedContext(), input.promptId, input.versionId)); }
  catch (error) { return apiError(error); }
}
