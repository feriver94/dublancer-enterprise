import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { FederatedIdentityService } from "@/lib/services/federated-identity.service";
import { ScimProvisioningService } from "@/lib/services/scim-provisioning.service";
import { identityAdministrationSchema } from "@/lib/validation/phase8";

const identity = new FederatedIdentityService();
const scim = new ScimProvisioningService();

export async function GET() {
  try {
    return apiSuccess(
      await identity.dashboard(await getAuthenticatedContext()),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = identityAdministrationSchema.parse(await request.json());
    if (input.action === "provider.create") {
      const { action: _, ...data } = input;
      return apiSuccess(await identity.createProvider(context, data), 201);
    }
    if (input.action === "provider.update") {
      const { action: _, providerId, ...data } = input;
      return apiSuccess(
        await identity.updateProvider(context, providerId, data),
      );
    }
    if (input.action === "provider.delete") {
      return apiSuccess(
        await identity.deleteProvider(context, input.providerId),
      );
    }
    if (input.action === "policy.update") {
      const { action: _, ...data } = input;
      return apiSuccess(await identity.updatePolicy(context, data));
    }
    if (input.action === "scim.token.create") {
      const { action: _, ...data } = input;
      return apiSuccess(await scim.createToken(context, data), 201);
    }
    return apiSuccess(await scim.revokeToken(context, input.tokenId));
  } catch (error) {
    return apiError(error);
  }
}
