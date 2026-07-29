import type { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/security/internal-auth";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseIntegrationService } from "@/lib/services/enterprise-integration.service";
import { integrationWorkerSchema } from "@/lib/validation/phase9";

const service = new EnterpriseIntegrationService();

export async function POST(request: NextRequest) {
  try {
    requireInternalSecret(request, "INTERNAL_WORKER_SECRET");
    const input = integrationWorkerSchema.parse(await request.json());
    return apiSuccess(
      input.action === "PROCESS_DELIVERIES"
        ? await service.processDeliveries(input.limit)
        : await service.processRuns(input.limit),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
