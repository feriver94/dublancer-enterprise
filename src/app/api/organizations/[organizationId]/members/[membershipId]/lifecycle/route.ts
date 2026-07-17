import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { memberLifecycleSchema } from "@/lib/validation/organization-lifecycle";
import { OrganizationLifecycleService } from "@/lib/services/organization-lifecycle.service";

const service = new OrganizationLifecycleService();
type Context = { params: Promise<{ organizationId: string; membershipId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { organizationId, membershipId } = await route.params;
    const { action } = memberLifecycleSchema.parse(await request.json());
    return apiSuccess(await service.memberAction(context, organizationId, membershipId, action));
  } catch (error) {
    return apiError(error);
  }
}
