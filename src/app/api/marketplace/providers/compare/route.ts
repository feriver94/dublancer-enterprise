import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PhaseCMarketplaceService } from "@/lib/services/phase-c-marketplace.service";
import { providerCompareSchema } from "@/lib/validation/phase-c";

export const dynamic = "force-dynamic";
const service = new PhaseCMarketplaceService();
export async function GET(request: NextRequest) {
  try {
    const ids = request.nextUrl.searchParams.getAll("id");
    return apiSuccess(await service.compare(await getAuthenticatedContext(), providerCompareSchema.parse({ ids }).ids));
  } catch (error) {
    return apiError(error);
  }
}
