import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import {
  getAuthenticatedContext,
  requireStepUpAuthentication,
} from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { PrivilegedAccessService } from "@/lib/services/privileged-access.service";
import { pamActionSchema } from "@/lib/validation/phase8";

const service = new PrivilegedAccessService();

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
    const input = pamActionSchema.parse(await request.json());
    const context =
      input.action === "decide" || input.action === "revoke"
        ? await requireStepUpAuthentication()
        : await getAuthenticatedContext();
    if (input.action === "request") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.request(context, data), 201);
    }
    if (input.action === "decide") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.decide(context, data));
    }
    if (input.action === "revoke") {
      return apiSuccess(
        await service.revoke(context, input.grantId, input.reason),
      );
    }
    return apiSuccess(await service.cancel(context, input.requestId));
  } catch (error) {
    return apiError(error);
  }
}
