import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { PresenceService } from "@/lib/realtime/presence.service";

const service = new PresenceService();

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  _request: Request,
  route: Context,
) {
  try {
    const context = await getAuthenticatedContext();
    const { projectId } = await route.params;

    return apiSuccess(
      await service.listProjectPresence(
        context,
        projectId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
