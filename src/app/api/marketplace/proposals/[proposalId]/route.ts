import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { proposalDecisionSchema } from "@/lib/validation/product";
import { requirePersonaPermission } from "@/lib/authorization/persona-policy";

const service = new MarketplaceService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = proposalDecisionSchema.parse(await request.json());
    await requirePersonaPermission(
      context,
      input.status === "WITHDRAWN" ? "marketplace.proposal.manage" : "marketplace.proposal.review",
      input.status === "WITHDRAWN" ? ["FREELANCER"] : ["CLIENT", "ORGANIZATION"],
    );
    return apiSuccess(await service.decideProposal(context, (await params).proposalId, input));
  } catch (error) { return apiError(error); }
}
