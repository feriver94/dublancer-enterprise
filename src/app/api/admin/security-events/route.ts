import { getAuthenticatedContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformQueryService } from "@/lib/services/product-platform.service";
const service = new PlatformQueryService();
export async function GET() { try { const context = await getAuthenticatedContext(); await requirePermission(context, "security.events.read"); return apiSuccess(await service.securityEvents(context)); } catch (error) { return apiError(error); } }
