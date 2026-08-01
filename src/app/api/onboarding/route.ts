import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PersonaService } from "@/lib/services/persona.service";
import { updateOnboardingSchema } from "@/lib/validation/persona";

export const dynamic = "force-dynamic";
const service = new PersonaService();

export async function GET() {
  try {
    return apiSuccess(await service.overview(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    return apiSuccess(await service.saveOnboarding(context, updateOnboardingSchema.parse(await request.json())));
  } catch (error) {
    return apiError(error);
  }
}
