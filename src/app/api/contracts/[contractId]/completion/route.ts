import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { Phase6ContractService } from "@/lib/services/phase6-contract.service";
import { contractCompletionSchema } from "@/lib/validation/phase6";
const service = new Phase6ContractService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) { try { await requireCsrfToken(request); return apiSuccess(await service.complete(await getAuthenticatedContext(), (await params).contractId, contractCompletionSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
