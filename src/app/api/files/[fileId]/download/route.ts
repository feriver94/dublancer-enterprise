import { getAuthenticatedContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";

const service = new EnterpriseFileProductService();
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try { const context = await getAuthenticatedContext(); await requirePermission(context, "files.read"); return apiSuccess(await service.download(context, (await params).fileId, new URL(request.url).searchParams.get("versionId") ?? undefined)); }
  catch (error) { return apiError(error); }
}
