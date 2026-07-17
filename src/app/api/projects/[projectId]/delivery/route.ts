import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { DeliveryService } from "@/lib/services/product-platform.service";
import { deliveryItemSchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new DeliveryService();
export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { const context = await getAuthenticatedContext(); await requirePermission(context, "workspace.delivery.manage"); return apiSuccess(await service.summary(context, (await params).projectId)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "workspace.delivery.manage"); return apiSuccess(await service.create(context, (await params).projectId, deliveryItemSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
