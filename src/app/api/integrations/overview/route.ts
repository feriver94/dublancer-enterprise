import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseIntegrationService } from "@/lib/services/enterprise-integration.service";
import { integrationActionSchema } from "@/lib/validation/phase9";

const service = new EnterpriseIntegrationService();

export async function GET() {
  try {
    return apiSuccess(await service.dashboard(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = integrationActionSchema.parse(await request.json());
    switch (input.action) {
      case "connector.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createConnector(context, data), 201);
      }
      case "apiKey.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createApiKey(context, data), 201);
      }
      case "apiKey.revoke":
        return apiSuccess(await service.revokeApiKey(context, input.apiKeyId));
      case "oauth.upsert": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.upsertOAuth(context, data), input.oauthId ? 200 : 201);
      }
      case "webhook.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createWebhook(context, data), 201);
      }
      case "subscription.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createSubscription(context, data), 201);
      }
      case "event.publish": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.publishEvent(context, data), 202);
      }
      case "connector.execute": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.executeConnector(context, data), 202);
      }
      case "delivery.retry":
        return apiSuccess(await service.retryDelivery(context, input.deliveryId), 202);
    }
  } catch (error) {
    return apiError(error);
  }
}
