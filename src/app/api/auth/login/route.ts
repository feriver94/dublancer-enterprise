import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { loginSchema } from "@/lib/validation/auth";
import { AuthService } from "@/lib/services/auth.service";
import { getRequestMetadata } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { withRequestSpan } from "@/lib/observability/telemetry";

const service = new AuthService();

export async function POST(request: NextRequest) {
  try {
    return await withRequestSpan(
      "auth.login",
      request,
      { "http.route": "/api/auth/login" },
      async () => {
        await requireCsrfToken(request);
        const input = loginSchema.parse(await request.json());
        const metadata = await getRequestMetadata();
        await enforceRateLimit({
          scope: "auth.login",
          identifier: `${metadata.ipAddress ?? "unknown"}:${input.email}`,
          limit: 20,
          windowMs: 900_000,
        });
        const result = await service.login(input, metadata);
        if (result.mfaRequired) {
          return apiSuccess(
            {
              mfaRequired: true,
              user: result.user,
              organizationId: result.organizationId,
              challengeId: result.challengeId,
              challengeToken: result.challengeToken,
              methods: result.methods,
              expiresAt: result.expiresAt,
            },
            202,
          );
        }
        await setAuthCookies(result.accessToken, result.refreshToken);
        return apiSuccess({
          mfaRequired: false,
          user: result.user,
          sessionId: result.sessionId,
          organizationId: result.organizationId,
          activePersonaId: result.activePersonaId,
          onboardingRequired: result.onboardingRequired,
          onboardingStage: result.onboardingStage,
        });
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
