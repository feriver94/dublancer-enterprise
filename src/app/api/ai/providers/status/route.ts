import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";

export const dynamic = "force-dynamic";
const service = new AiGovernanceService();
export async function GET() { try { return apiSuccess(await service.providerStatus(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
