import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";
import { phase4UpdateFileSchema } from "@/lib/validation/phase4";

const service = new EnterpriseFileProductService();
type Route = { params: Promise<{ fileId: string }> };

export async function GET(_request: NextRequest, route: Route) {
  try { return apiSuccess(await service.get(await getAuthenticatedContext(), (await route.params).fileId)); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, route: Route) {
  try { await requireCsrfToken(request); return apiSuccess(await service.update(await getAuthenticatedContext(), (await route.params).fileId, phase4UpdateFileSchema.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, route: Route) {
  try { await requireCsrfToken(request); const body = await request.json().catch(() => ({})); return apiSuccess(await service.update(await getAuthenticatedContext(), (await route.params).fileId, phase4UpdateFileSchema.parse({ ...body, deleted: true }))); }
  catch (error) { return apiError(error); }
}
