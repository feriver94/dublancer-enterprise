import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { securityEventUpdateSchema } from "@/lib/validation/phase5";

const service = new EnterpriseOperationsService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) { try { await requireCsrfToken(request); return apiSuccess(await service.updateSecurityEvent(await getAuthenticatedContext(), (await params).eventId, securityEventUpdateSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
