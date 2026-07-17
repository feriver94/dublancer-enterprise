import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformQueryService } from "@/lib/services/product-platform.service";
import { exportRequestSchema } from "@/lib/validation/product";
const service = new PlatformQueryService();
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "data.export"); return apiSuccess(await service.requestExport(context, exportRequestSchema.parse(await request.json())), 202); } catch (error) { return apiError(error); } }
