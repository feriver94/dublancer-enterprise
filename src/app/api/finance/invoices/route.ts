import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FinanceService } from "@/lib/services/product-platform.service";
import { createInvoiceSchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new FinanceService();
export async function GET() { try { const context = await getAuthenticatedContext(); await requirePermission(context, "finance.read"); return apiSuccess(await service.listInvoices(context)); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "finance.manage"); return apiSuccess(await service.createInvoice(context, createInvoiceSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
