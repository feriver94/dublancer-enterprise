import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { Phase6ContractService } from "@/lib/services/phase6-contract.service";
import { milestoneCloseoutSchema } from "@/lib/validation/phase6";
const service = new Phase6ContractService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ contractId: string; milestoneId: string }> }) { try { await requireCsrfToken(request); const ids = await params; return apiSuccess(await service.closeMilestone(await getAuthenticatedContext(), ids.contractId, ids.milestoneId, milestoneCloseoutSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
