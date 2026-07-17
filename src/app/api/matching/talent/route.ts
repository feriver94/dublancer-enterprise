import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { TalentMatchingService } from "@/lib/services/enterprise-orchestration.service";
import { talentMatchSchema } from "@/lib/validation/orchestration";
const service = new TalentMatchingService();
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const input = talentMatchSchema.parse(await request.json()); return apiSuccess(await service.generate(await getAuthenticatedContext(), input.listingId, input.limit), 201); } catch (error) { return apiError(error); } }
