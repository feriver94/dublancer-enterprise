import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { proposalDecisionSchema } from "@/lib/validation/product";
import { proposalEditSchema } from "@/lib/validation/phase-c";
import { requirePersonaPermission } from "@/lib/authorization/persona-policy";

const service = new MarketplaceService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const body = await request.json();
    if (body && typeof body === "object" && "coverLetter" in body) {
      await requirePersonaPermission(context, "marketplace.proposal.manage", ["FREELANCER", "ORGANIZATION"]);
      return apiSuccess(await service.updateProposal(context, (await params).proposalId, proposalEditSchema.parse(body)));
    }
    const input = proposalDecisionSchema.parse(body);
    await requirePersonaPermission(
      context,
      input.status === "WITHDRAWN" ? "marketplace.proposal.manage" : "marketplace.proposal.review",
      input.status === "WITHDRAWN" ? ["FREELANCER", "ORGANIZATION"] : ["CLIENT", "ORGANIZATION"],
    );
    return apiSuccess(await service.decideProposal(context, (await params).proposalId, input));
  } catch (error) { return apiError(error); }
}
