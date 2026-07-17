import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { inviteOrganizationMemberSchema } from "@/lib/validation/organization-lifecycle";
import { OrganizationLifecycleService } from "@/lib/services/organization-lifecycle.service";

const service = new OrganizationLifecycleService();
type Context = { params: Promise<{ organizationId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { organizationId } = await route.params;
    const input = inviteOrganizationMemberSchema.parse(await request.json());
    return apiSuccess(await service.invite(context, organizationId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
