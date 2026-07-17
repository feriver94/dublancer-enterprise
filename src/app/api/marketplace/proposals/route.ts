import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { createProposalSchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new MarketplaceService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const listingId = request.nextUrl.searchParams.get("listingId") ?? undefined;
    await requirePermission(context, listingId ? "marketplace.proposal.review" : "marketplace.proposal.manage");
    return apiSuccess(await service.listProposals(context, listingId));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.proposal.manage");
    return apiSuccess(await service.submitProposal(context, createProposalSchema.parse(await request.json())), 201);
  } catch (error) { return apiError(error); }
}
