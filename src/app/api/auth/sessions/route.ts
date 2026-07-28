import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { SessionManagementService } from "@/lib/services/session-management.service";
import { sessionActionSchema } from "@/lib/validation/phase8";

const service = new SessionManagementService();

export async function GET(request: NextRequest) {
  try {
    const scope =
      request.nextUrl.searchParams.get("scope") === "organization"
        ? "organization"
        : "self";
    return apiSuccess(
      await service.list(await getAuthenticatedContext(), scope),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = sessionActionSchema.parse(await request.json());
    if (input.action === "session.revoke") {
      const result = await service.revokeSession(context, input.sessionId);
      if (result.currentSessionRevoked) await clearAuthCookies();
      return apiSuccess(result);
    }
    if (input.action === "sessions.revokeOthers") {
      return apiSuccess(await service.revokeOtherSessions(context));
    }
    return apiSuccess(await service.revokeDevice(context, input.deviceId));
  } catch (error) {
    return apiError(error);
  }
}
