import type { NextRequest } from "next/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext, getRequestMetadata } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { setAuthCookies } from "@/lib/auth/cookies";
import { MfaPasskeyService } from "@/lib/services/mfa-passkey.service";
import { passkeyActionSchema } from "@/lib/validation/phase8";

const service = new MfaPasskeyService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const input = passkeyActionSchema.parse(await request.json());
    if (input.action === "authentication.options") {
      return apiSuccess(
        await service.authenticationOptions({
          email: input.email,
          organizationId: input.organizationId,
          deviceLabel: input.deviceLabel,
          metadata: await getRequestMetadata(),
        }),
      );
    }
    if (input.action === "authentication.verify") {
      const result = await service.verifyAuthentication(
        input.challengeId,
        input.response as unknown as AuthenticationResponseJSON,
      );
      await setAuthCookies(result.accessToken, result.refreshToken);
      return apiSuccess({
        user: result.user,
        sessionId: result.sessionId,
        organizationId: result.organizationId,
      });
    }
    const context = await getAuthenticatedContext();
    if (input.action === "registration.options") {
      return apiSuccess(
        await service.registrationOptions(context, input.label),
        201,
      );
    }
    return apiSuccess(
      await service.verifyRegistration(
        context,
        input.challengeId,
        input.response as unknown as RegistrationResponseJSON,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
