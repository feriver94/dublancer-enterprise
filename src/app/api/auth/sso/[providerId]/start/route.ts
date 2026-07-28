import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FederatedIdentityService } from "@/lib/services/federated-identity.service";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ providerId: string }> };
const service = new FederatedIdentityService();

export async function GET(request: NextRequest, route: RouteContext) {
  try {
    const { providerId } = await route.params;
    await enforceRateLimit({
      scope: "identity.sso.start",
      identifier: `${providerId}:${request.headers.get("x-forwarded-for") ?? "unknown"}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });
    return apiSuccess(
      await service.start(
        providerId,
        request.nextUrl.searchParams.get("returnTo"),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
