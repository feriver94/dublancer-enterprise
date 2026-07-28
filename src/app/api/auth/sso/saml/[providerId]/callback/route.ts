import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestMetadata } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";
import { FederatedIdentityService } from "@/lib/services/federated-identity.service";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { withRequestSpan } from "@/lib/observability/telemetry";

type RouteContext = { params: Promise<{ providerId: string }> };
const service = new FederatedIdentityService();

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    const { providerId } = await route.params;
    return await withRequestSpan(
      "identity.sso.saml.callback",
      request,
      {
        "http.route": "/api/auth/sso/saml/{providerId}/callback",
        "identity.provider.id": providerId,
      },
      async () => {
        await enforceRateLimit({
          scope: "identity.saml.callback",
          identifier: `${providerId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`,
          limit: 60,
          windowMs: 15 * 60_000,
        });
        const contentType = request.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json")
          ? await request.json()
          : Object.fromEntries(await request.formData());
        const state = String(body.RelayState ?? body.state ?? "");
        const samlResponse = String(body.SAMLResponse ?? "");
        const result = await service.completeSaml({
          providerId,
          state,
          samlResponse,
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
