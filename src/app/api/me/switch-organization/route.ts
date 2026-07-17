import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { switchOrganizationSchema } from "@/lib/validation/identity";
import { IdentityService } from "@/lib/services/identity.service";

const service = new IdentityService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = switchOrganizationSchema.parse(await request.json());
    return apiSuccess(
      await service.switchOrganization(context, input.organizationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
