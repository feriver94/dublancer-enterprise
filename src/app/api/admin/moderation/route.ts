import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { moderationDecisionSchema } from "@/lib/validation/commercial";

const service = new EnterpriseOperationsService();
export async function GET() { try { return apiSuccess(await service.moderation(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest) { try { await requireCsrfToken(request); return apiSuccess(await service.decideModeration(await getAuthenticatedContext(), moderationDecisionSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
