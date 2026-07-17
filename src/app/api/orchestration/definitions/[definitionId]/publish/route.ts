import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOrchestrationService } from "@/lib/services/enterprise-orchestration.service";
const service = new EnterpriseOrchestrationService();
export async function POST(request: NextRequest, route: { params: Promise<{ definitionId: string }> }) { try { await requireCsrfToken(request); const { definitionId } = await route.params; return apiSuccess(await service.publish(await getAuthenticatedContext(), definitionId)); } catch (error) { return apiError(error); } }
