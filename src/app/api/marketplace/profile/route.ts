import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { marketplaceProfileSchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new MarketplaceService();

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.profile.manage");
    return apiSuccess(await service.profile(context));
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.profile.manage");
    return apiSuccess(await service.upsertProfile(context, marketplaceProfileSchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
