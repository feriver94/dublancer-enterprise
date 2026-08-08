import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileManagementService } from "@/lib/services/profile-management.service";
import { updateProfileSettingsSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new ProfileManagementService();

export async function GET() {
  try {
    return apiSuccess(await service.settings(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    return apiSuccess(await service.updateSettings(context, updateProfileSettingsSchema.parse(await request.json())));
  } catch (error) {
    return apiError(error);
  }
}
