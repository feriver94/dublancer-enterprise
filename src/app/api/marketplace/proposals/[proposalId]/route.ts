import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { proposalDecisionSchema } from "@/lib/validation/product";

const service = new MarketplaceService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = proposalDecisionSchema.parse(await request.json());
    await requirePermission(context, input.status === "WITHDRAWN" ? "marketplace.proposal.manage" : "marketplace.proposal.review");
    return apiSuccess(await service.decideProposal(context, (await params).proposalId, input.status));
  } catch (error) { return apiError(error); }
}
