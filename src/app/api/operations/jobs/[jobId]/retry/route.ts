import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { jobActionSchema } from "@/lib/validation/phase5";

const service = new EnterpriseOperationsService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { try { await requireCsrfToken(request); const input = jobActionSchema.parse(await request.json()); return apiSuccess(await service.retryJob(await getAuthenticatedContext(), (await params).jobId, input.reason)); } catch (error) { return apiError(error); } }
