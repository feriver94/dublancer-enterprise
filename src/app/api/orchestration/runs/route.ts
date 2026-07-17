import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOrchestrationService } from "@/lib/services/enterprise-orchestration.service";
import { startWorkflowRunSchema } from "@/lib/validation/orchestration";
const service = new EnterpriseOrchestrationService();
export async function GET() { try { return apiSuccess(await service.listRuns(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); return apiSuccess(await service.start(context, startWorkflowRunSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
