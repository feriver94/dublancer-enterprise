import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { inviteOrganizationMemberSchema } from "@/lib/validation/organization-lifecycle";
import { OrganizationLifecycleService } from "@/lib/services/organization-lifecycle.service";

const service = new OrganizationLifecycleService();

type RouteContext = {
  params: Promise<{
    organizationId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  routeContext: RouteContext,
) {
  try {
    await requireCsrfToken(request);

    const authenticatedContext =
      await getAuthenticatedContext();

    const { organizationId } =
      await routeContext.params;

    const input =
      inviteOrganizationMemberSchema.parse(
        await request.json(),
      );

    const result = await service.invite(
      authenticatedContext,
      organizationId,
      input,
    );

    return apiSuccess(result, 201);
  } catch (error) {
    return apiError(error);
  }
}