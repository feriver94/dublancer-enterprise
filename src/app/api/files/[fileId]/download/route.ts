import { getAuthenticatedContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileService } from "@/lib/services/product-platform.service";

const service = new EnterpriseFileService();
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try { const context = await getAuthenticatedContext(); await requirePermission(context, "files.read"); return apiSuccess(await service.download(context, (await params).fileId)); }
  catch (error) { return apiError(error); }
}
