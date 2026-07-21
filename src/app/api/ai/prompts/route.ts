import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { aiPromptSchema } from "@/lib/validation/phase5";

export const dynamic = "force-dynamic";
const service = new AiGovernanceService();
export async function GET() { try { return apiSuccess(await service.prompts(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); return apiSuccess(await service.createPrompt(await getAuthenticatedContext(), aiPromptSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
