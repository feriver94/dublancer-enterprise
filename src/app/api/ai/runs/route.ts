import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiRunService } from "@/lib/services/product-platform.service";
import { createAiRunSchema } from "@/lib/validation/product";
import { aiRunListSchema } from "@/lib/validation/phase5";

export const dynamic = "force-dynamic";
const service = new AiRunService();
export async function GET(request: NextRequest) { try { const context = await getAuthenticatedContext(); await requirePermission(context, "ai.use"); const result = await service.list(context, aiRunListSchema.parse(Object.fromEntries(request.nextUrl.searchParams))); return apiSuccess(result.items, 200, { nextCursor: result.nextCursor }); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "ai.use"); return apiSuccess(await service.create(context, createAiRunSchema.parse(await request.json())), 202); } catch (error) { return apiError(error); } }
