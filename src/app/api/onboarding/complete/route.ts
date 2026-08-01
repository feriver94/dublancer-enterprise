import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { setAccessCookie } from "@/lib/auth/cookies";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PersonaService } from "@/lib/services/persona.service";
import { completeOnboardingSchema } from "@/lib/validation/persona";

const service = new PersonaService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = completeOnboardingSchema.parse(await request.json());
    const completion = await service.completeOnboarding(context, input.preferredPersonaId);
    const switched = await service.switchPersona(context, completion.preferredPersonaId);
    await setAccessCookie(switched.accessToken);
    return apiSuccess({ completed: true, persona: switched.persona, redirectTo: switched.redirectTo });
  } catch (error) {
    return apiError(error);
  }
}
