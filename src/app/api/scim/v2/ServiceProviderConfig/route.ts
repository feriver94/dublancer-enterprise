import type { NextRequest } from "next/server";
import { scimApiError, scimResponse } from "@/lib/http/scim-response";
import { ScimProvisioningService } from "@/lib/services/scim-provisioning.service";

const service = new ScimProvisioningService();

export async function GET(request: NextRequest) {
  try {
    const principal = await service.authenticate(
      request.headers.get("authorization"),
    );
    return scimResponse(await service.serviceProviderConfig(principal));
  } catch (error) {
    return scimApiError(error);
  }
}
