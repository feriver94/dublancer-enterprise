import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { createRoleSchema } from "@/lib/validation/identity";
import { IdentityService } from "@/lib/services/identity.service";

const service = new IdentityService();

export async function GET(request: NextRequest) {
  try {
    return apiSuccess(
      await service.listRoles(await getAuthenticatedContext()),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = createRoleSchema.parse(await request.json());
    return apiSuccess(await service.createRole(context, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
