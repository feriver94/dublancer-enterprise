import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalSecret } from "@/lib/security/internal-auth";
import { EnterpriseOrchestrationService } from "@/lib/services/enterprise-orchestration.service";
import { workerClaimSchema } from "@/lib/validation/orchestration";
const service = new EnterpriseOrchestrationService();
export async function POST(request: NextRequest) { try { requireInternalSecret(request, "INTERNAL_WORKER_SECRET"); const input = workerClaimSchema.parse(await request.json()); return apiSuccess(await service.processNext(input.workerId), 202); } catch (error) { return apiError(error); } }
