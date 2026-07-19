import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { awardProposalSchema } from "@/lib/validation/product";

const service = new MarketplaceService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = awardProposalSchema.parse(await request.json());
    const contract = await service.awardProposal(
      context,
      (await params).proposalId,
      input,
    );
    return apiSuccess(contract, 201);
  } catch (error) {
    return apiError(error);
  }
}
