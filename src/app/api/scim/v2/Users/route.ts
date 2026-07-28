import type { NextRequest } from "next/server";
import { scimApiError, scimResponse } from "@/lib/http/scim-response";
import { ScimProvisioningService } from "@/lib/services/scim-provisioning.service";
import { withRequestSpan } from "@/lib/observability/telemetry";

const service = new ScimProvisioningService();

export async function GET(request: NextRequest) {
  try {
    return await withRequestSpan(
      "identity.scim.users.list",
      request,
      { "http.route": "/api/scim/v2/Users" },
      async () => {
        const principal = await service.authenticate(
          request.headers.get("authorization"),
        );
        return scimResponse(
          await service.listUsers(principal, {
            filter: request.nextUrl.searchParams.get("filter"),
            startIndex: Number(
              request.nextUrl.searchParams.get("startIndex") ?? 1,
            ),
            count: Number(request.nextUrl.searchParams.get("count") ?? 100),
          }),
        );
      },
    );
  } catch (error) {
    return scimApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await withRequestSpan(
      "identity.scim.users.create",
      request,
      { "http.route": "/api/scim/v2/Users" },
      async () => {
        const principal = await service.authenticate(
          request.headers.get("authorization"),
        );
        const user = await service.createUser(
          principal,
          await request.json(),
          request.headers.get("x-request-id") ?? undefined,
        );
        return scimResponse(user, 201, {
          location: `${request.nextUrl.origin}/api/scim/v2/Users/${user.id}`,
          etag: user.meta.version,
        });
      },
    );
  } catch (error) {
    return scimApiError(error);
  }
}
