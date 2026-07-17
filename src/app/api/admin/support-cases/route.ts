import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformQueryService } from "@/lib/services/product-platform.service";
import { supportCaseSchema } from "@/lib/validation/product";
const service = new PlatformQueryService();
export async function GET() { try { const context = await getAuthenticatedContext(); await requirePermission(context, "support.manage"); return apiSuccess(await service.supportCases(context)); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "support.manage"); return apiSuccess(await service.createSupportCase(context, supportCaseSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
