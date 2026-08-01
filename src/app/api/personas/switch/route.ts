import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { setAccessCookie } from "@/lib/auth/cookies";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PersonaService } from "@/lib/services/persona.service";
import { switchPersonaSchema } from "@/lib/validation/persona";

const service = new PersonaService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = switchPersonaSchema.parse(await request.json());
    const result = await service.switchPersona(context, input.personaId);
    await setAccessCookie(result.accessToken);
    return apiSuccess({ persona: result.persona, redirectTo: result.redirectTo });
  } catch (error) {
    return apiError(error);
  }
}
