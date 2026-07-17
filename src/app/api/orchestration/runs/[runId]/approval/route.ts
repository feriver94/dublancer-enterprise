import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOrchestrationService } from "@/lib/services/enterprise-orchestration.service";
import { workflowApprovalSchema } from "@/lib/validation/orchestration";
const service = new EnterpriseOrchestrationService();
export async function POST(request: NextRequest, route: { params: Promise<{ runId: string }> }) { try { await requireCsrfToken(request); const { runId } = await route.params; return apiSuccess(await service.decide(await getAuthenticatedContext(), runId, workflowApprovalSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
