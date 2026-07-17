import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { OrganizationDomainService } from "@/lib/services/organization-domain.service";
import { invitationStatusSchema } from "@/lib/validation/organization";
const service = new OrganizationDomainService();
type Context = { params: Promise<{ organizationId: string; invitationId: string }> };
export async function PATCH(request: NextRequest, route: Context) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); const params = await route.params; const { status } = invitationStatusSchema.parse(await request.json()); return apiSuccess(await service.setInvitation(context, params.organizationId, params.invitationId, status)); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest, route: Context) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); const params = await route.params; return apiSuccess(await service.deleteInvitation(context, params.organizationId, params.invitationId)); }
  catch (error) { return apiError(error); }
}
