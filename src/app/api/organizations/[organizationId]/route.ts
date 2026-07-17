import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { OrganizationDomainService } from "@/lib/services/organization-domain.service";
import { updateOrganizationSchema } from "@/lib/validation/organization";
const service = new OrganizationDomainService();
type Context = { params: Promise<{ organizationId: string }> };
export async function GET(_request: NextRequest, route: Context) {
  try { const context = await getAuthenticatedContext(); return apiSuccess(await service.get(context, (await route.params).organizationId)); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest, route: Context) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); return apiSuccess(await service.update(context, (await route.params).organizationId, updateOrganizationSchema.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}
