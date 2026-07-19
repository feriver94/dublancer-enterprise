import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FinanceService } from "@/lib/services/product-platform.service";
import { invoiceTransitionSchema } from "@/lib/validation/product";

const service = new FinanceService();
type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: NextRequest, route: RouteContext) {
  try {
    return apiSuccess(
      await service.getInvoice(
        await getAuthenticatedContext(),
        (await route.params).invoiceId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    return apiSuccess(
      await service.transitionInvoice(
        await getAuthenticatedContext(),
        (await route.params).invoiceId,
        invoiceTransitionSchema.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
