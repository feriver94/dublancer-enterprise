import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PersonaService } from "@/lib/services/persona.service";
import { activatePersonaSchema } from "@/lib/validation/persona";

const service = new PersonaService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = activatePersonaSchema.parse(await request.json());
    return apiSuccess(await service.activate(context, input.personaId));
  } catch (error) {
    return apiError(error);
  }
}
