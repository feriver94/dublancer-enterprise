import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { Phase6ContractService } from "@/lib/services/phase6-contract.service";
import { contractReviewSchema } from "@/lib/validation/phase6";
const service = new Phase6ContractService();
export async function GET(_request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) { try { return apiSuccess(await service.reviews(await getAuthenticatedContext(), (await params).contractId)); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) { try { await requireCsrfToken(request); return apiSuccess(await service.createReview(await getAuthenticatedContext(), (await params).contractId, contractReviewSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
