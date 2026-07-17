import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { IdentityService } from "@/lib/services/identity.service";

const service = new IdentityService();

export async function GET(request: NextRequest) {
  try {
    return apiSuccess(
      await service.listOrganizations(await getAuthenticatedContext()),
    );
  } catch (error) {
    return apiError(error);
  }
}
