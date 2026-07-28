import type { NextRequest } from "next/server";
import { scimApiError, scimResponse } from "@/lib/http/scim-response";
import { ScimProvisioningService } from "@/lib/services/scim-provisioning.service";
import { withRequestSpan } from "@/lib/observability/telemetry";

type RouteContext = { params: Promise<{ resourceId: string }> };
const service = new ScimProvisioningService();

export async function GET(request: NextRequest, route: RouteContext) {
  try {
    const { resourceId } = await route.params;
    return await withRequestSpan(
      "identity.scim.users.get",
      request,
      {
        "http.route": "/api/scim/v2/Users/{resourceId}",
        "scim.resource.id": resourceId,
      },
      async () => {
        const principal = await service.authenticate(
          request.headers.get("authorization"),
        );
        const user = await service.getUser(principal, resourceId);
        return scimResponse(user, 200, { etag: user.meta.version });
      },
    );
  } catch (error) {
    return scimApiError(error);
  }
}

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    const { resourceId } = await route.params;
    return await withRequestSpan(
      "identity.scim.users.patch",
      request,
      {
        "http.route": "/api/scim/v2/Users/{resourceId}",
        "scim.resource.id": resourceId,
      },
      async () => {
        const principal = await service.authenticate(
          request.headers.get("authorization"),
        );
        const body = (await request.json()) as {
          Operations?: Array<{
            op: string;
            path?: string;
            value?: unknown;
          }>;
        };
        const user = await service.patchUser(
          principal,
          resourceId,
          body.Operations ?? [],
          request.headers.get("x-request-id") ?? undefined,
        );
        return scimResponse(user, 200, { etag: user.meta.version });
      },
    );
  } catch (error) {
    return scimApiError(error);
  }
}

export async function DELETE(request: NextRequest, route: RouteContext) {
  try {
    const { resourceId } = await route.params;
    return await withRequestSpan(
      "identity.scim.users.delete",
      request,
      {
        "http.route": "/api/scim/v2/Users/{resourceId}",
        "scim.resource.id": resourceId,
      },
      async () => {
        const principal = await service.authenticate(
          request.headers.get("authorization"),
        );
        await service.deleteUser(
          principal,
          resourceId,
          request.headers.get("x-request-id") ?? undefined,
        );
        return new Response(null, { status: 204 });
      },
    );
  } catch (error) {
    return scimApiError(error);
  }
}
