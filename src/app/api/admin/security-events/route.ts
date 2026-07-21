import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";

const service = new EnterpriseOperationsService();
export async function GET() { try { return apiSuccess(await service.securityEvents(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
