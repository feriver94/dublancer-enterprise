import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseIntegrationService } from "@/lib/services/enterprise-integration.service";
import { externalIntegrationEventSchema } from "@/lib/validation/phase9";
import { withRequestSpan } from "@/lib/observability/telemetry";

const service = new EnterpriseIntegrationService();

export async function POST(request: NextRequest) {
  try {
    const principal = await service.authenticateApiKey(request, "events.publish");
    const input = externalIntegrationEventSchema.parse(await request.json());
    return apiSuccess(
      await withRequestSpan(
        "phase9.integrations.rest_event",
        request,
        { "dublancer.organization.id": principal.organizationId },
        () =>
          service.publishAuthorizedEvent(
            principal.organizationId,
            principal.userId,
            input,
          ),
      ),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
