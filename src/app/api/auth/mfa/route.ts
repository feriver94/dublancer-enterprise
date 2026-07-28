import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { setAuthCookies } from "@/lib/auth/cookies";
import { MfaPasskeyService } from "@/lib/services/mfa-passkey.service";
import { mfaActionSchema } from "@/lib/validation/phase8";

const service = new MfaPasskeyService();

export async function GET() {
  try {
    return apiSuccess(await service.list(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const input = mfaActionSchema.parse(await request.json());
    if (input.action === "challenge.verify") {
      const result = await service.verifyLoginChallenge(input);
      await setAuthCookies(result.accessToken, result.refreshToken);
      return apiSuccess({
        user: result.user,
        sessionId: result.sessionId,
        organizationId: result.organizationId,
      });
    }
    const context = await getAuthenticatedContext();
    if (input.action === "totp.setup") {
      return apiSuccess(await service.setupTotp(context, input.label), 201);
    }
    if (input.action === "totp.verify") {
      return apiSuccess(
        await service.verifyTotpEnrollment(
          context,
          input.factorId,
          input.code,
        ),
      );
    }
    return apiSuccess(
      await service.revoke(context, {
        factorId: input.factorId,
        passkeyId: input.passkeyId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
