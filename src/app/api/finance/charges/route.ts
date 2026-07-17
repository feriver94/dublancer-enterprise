import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FinanceService } from "@/lib/services/product-platform.service";
import { createChargeSchema } from "@/lib/validation/product";
const service = new FinanceService();
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "finance.manage"); const input = createChargeSchema.parse(await request.json()); return apiSuccess(await service.chargeInvoice(context, input.invoiceId, input.idempotencyKey), 202); }
  catch (error) { return apiError(error); }
}
