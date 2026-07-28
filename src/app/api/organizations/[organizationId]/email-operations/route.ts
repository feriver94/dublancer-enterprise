import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { EmailOperationsService } from "@/lib/services/email-operations.service";

type RouteContext = { params: Promise<{ organizationId: string }> };
const service = new EmailOperationsService();

export async function GET(_: NextRequest, route: RouteContext) {
  try {
    const [context, params] = await Promise.all([getAuthenticatedContext(), route.params]);
    if (context.organizationId !== params.organizationId && !context.isPlatformAdmin) {
      throw new AppError("FORBIDDEN", "Organization access denied.", 403);
    }
    return apiSuccess(await service.history(context));
  } catch (error) {
    return apiError(error);
  }
}
