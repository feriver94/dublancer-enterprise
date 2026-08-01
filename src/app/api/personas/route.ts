import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PersonaService } from "@/lib/services/persona.service";

export const dynamic = "force-dynamic";
const service = new PersonaService();

export async function GET() {
  try {
    return apiSuccess(await service.overview(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}
