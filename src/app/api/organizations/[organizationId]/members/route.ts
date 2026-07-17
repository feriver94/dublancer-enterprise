import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { OrganizationDomainService } from "@/lib/services/organization-domain.service";
const service = new OrganizationDomainService();
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try { const context = await getAuthenticatedContext(); return apiSuccess(await service.members(context, (await params).organizationId)); }
  catch (error) { return apiError(error); }
}
