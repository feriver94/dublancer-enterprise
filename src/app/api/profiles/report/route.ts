import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileManagementService } from "@/lib/services/profile-management.service";
import { reportProfileSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new ProfileManagementService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    return apiSuccess(await service.report(await getAuthenticatedContext(), reportProfileSchema.parse(await request.json())), 201);
  } catch (error) {
    return apiError(error);
  }
}
