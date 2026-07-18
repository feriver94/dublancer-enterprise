import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { acceptOrganizationInvitationSchema } from "@/lib/validation/organization-lifecycle";
import { OrganizationLifecycleService } from "@/lib/services/organization-lifecycle.service";
import { requireCsrfToken } from "@/lib/auth/csrf";

const service = new OrganizationLifecycleService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { token } = acceptOrganizationInvitationSchema.parse(await request.json());
    return apiSuccess(await service.accept(context, token));
  } catch (error) {
    return apiError(error);
  }
}
