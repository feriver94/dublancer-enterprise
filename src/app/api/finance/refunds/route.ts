import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FinanceService } from "@/lib/services/product-platform.service";
import { createRefundSchema } from "@/lib/validation/product";

const service = new FinanceService();

export async function GET() {
  try {
    return apiSuccess(await service.listRefunds(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    return apiSuccess(
      await service.createRefund(
        await getAuthenticatedContext(),
        createRefundSchema.parse(await request.json()),
      ),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
