import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformQueryService } from "@/lib/services/product-platform.service";

export const dynamic = "force-dynamic";
const service = new PlatformQueryService();
export async function GET(request: NextRequest) { try { const context = await getAuthenticatedContext(); await requirePermission(context, "analytics.read"); const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 30))); return apiSuccess(await service.analytics(context, days)); } catch (error) { return apiError(error); } }
