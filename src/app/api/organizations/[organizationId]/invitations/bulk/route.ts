import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { AppError } from "@/lib/errors/app-error";
import { MemberAdministrationService } from "@/lib/services/member-administration.service";
import { bulkInvitationsSchema } from "@/lib/validation/phase7";

type RouteContext = { params: Promise<{ organizationId: string }> };
const service = new MemberAdministrationService();

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const [context, params] = await Promise.all([getAuthenticatedContext(), route.params]);
    if (context.organizationId !== params.organizationId && !context.isPlatformAdmin) {
      throw new AppError("FORBIDDEN", "Organization access denied.", 403);
    }
    const { invitations } = bulkInvitationsSchema.parse(await request.json());
    return apiSuccess(await service.bulkInvite(context, invitations), 201);
  } catch (error) {
    return apiError(error);
  }
}
