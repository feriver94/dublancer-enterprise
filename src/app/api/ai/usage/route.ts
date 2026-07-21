import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { aiUsageSchema } from "@/lib/validation/phase5";

const service = new AiGovernanceService();
export async function GET(request: NextRequest) { try { const input = aiUsageSchema.parse(Object.fromEntries(request.nextUrl.searchParams)); return apiSuccess(await service.usage(await getAuthenticatedContext(), input.days)); } catch (error) { return apiError(error); } }
