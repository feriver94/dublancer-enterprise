import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { membershipActionSchema } from "@/lib/validation/identity";
import { IdentityService } from "@/lib/services/identity.service";

const service = new IdentityService();
type Context = { params: Promise<{ membershipId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { membershipId } = await route.params;
    const { action } = membershipActionSchema.parse(await request.json());
    return apiSuccess(
      await service.performMembershipAction(context, membershipId, action),
    );
  } catch (error) {
    return apiError(error);
  }
}
