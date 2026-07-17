import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { WorkGraphService } from "@/lib/services/enterprise-orchestration.service";
const service = new WorkGraphService();
export async function GET() { try { return apiSuccess(await service.snapshot(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); return apiSuccess(await service.rebuild(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
