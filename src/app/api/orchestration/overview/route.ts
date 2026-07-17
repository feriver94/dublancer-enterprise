import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOrchestrationService } from "@/lib/services/enterprise-orchestration.service";
const service = new EnterpriseOrchestrationService();
export const dynamic = "force-dynamic";
export async function GET() { try { return apiSuccess(await service.overview(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
