import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { OrganizationDomainService } from "@/lib/services/organization-domain.service";
import { membershipSchema } from "@/lib/validation/organization";
const service = new OrganizationDomainService();
type Context = { params: Promise<{ organizationId: string; membershipId: string }> };
export async function PATCH(request: NextRequest, route: Context) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); const params = await route.params; return apiSuccess(await service.updateMember(context, params.organizationId, params.membershipId, membershipSchema.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest, route: Context) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); const params = await route.params; return apiSuccess(await service.removeMember(context, params.organizationId, params.membershipId)); }
  catch (error) { return apiError(error); }
}
