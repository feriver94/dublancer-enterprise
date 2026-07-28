import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestMetadata } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";
import { FederatedIdentityService } from "@/lib/services/federated-identity.service";
import { withRequestSpan } from "@/lib/observability/telemetry";

type RouteContext = { params: Promise<{ providerId: string }> };
const service = new FederatedIdentityService();

export async function GET(request: NextRequest, route: RouteContext) {
  try {
    const { providerId } = await route.params;
    return await withRequestSpan(
      "identity.sso.oidc.callback",
      request,
      {
        "http.route": "/api/auth/sso/oidc/{providerId}/callback",
        "identity.provider.id": providerId,
      },
      async () => {
        const state = request.nextUrl.searchParams.get("state");
        const code = request.nextUrl.searchParams.get("code");
        if (!state || !code) {
          return apiSuccess(
            {
              authenticated: false,
              error: "OIDC callback parameters are missing.",
            },
            400,
          );
        }
        const result = await service.completeOidc({
          providerId,
          state,
          code,
          metadata: await getRequestMetadata(),
        });
        if (result.mfaRequired) return apiSuccess(result, 202);
        await setAuthCookies(result.accessToken, result.refreshToken);
        return apiSuccess({
          authenticated: true,
          sessionId: result.sessionId,
          organizationId: result.organizationId,
          returnTo: result.returnTo,
        });
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
