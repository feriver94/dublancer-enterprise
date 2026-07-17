import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { createListingSchema, listingQuerySchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new MarketplaceService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.listing.read");
    const query = listingQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await service.listListings(context, query);
    return apiSuccess(result.items, 200, { nextCursor: result.nextCursor });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.listing.manage");
    return apiSuccess(await service.createListing(context, createListingSchema.parse(await request.json())), 201);
  } catch (error) { return apiError(error); }
}
