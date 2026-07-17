import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformQueryService } from "@/lib/services/product-platform.service";
import { searchSchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new PlatformQueryService();
export async function GET(request: NextRequest) { try { const context = await getAuthenticatedContext(); await requirePermission(context, "search.use"); return apiSuccess(await service.search(context, searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams)))); } catch (error) { return apiError(error); } }
