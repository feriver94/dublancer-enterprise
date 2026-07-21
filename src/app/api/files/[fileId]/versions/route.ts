import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";

const service = new EnterpriseFileProductService();
export async function GET(_request: Request, route: { params: Promise<{ fileId: string }> }) {
  try { return apiSuccess(await service.versions(await getAuthenticatedContext(), (await route.params).fileId)); }
  catch (error) { return apiError(error); }
}
