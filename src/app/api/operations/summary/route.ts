import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PlatformOperationsService } from "@/lib/services/platform-operations.service";
const service = new PlatformOperationsService();
export async function GET() { try { return apiSuccess(await service.summary(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
