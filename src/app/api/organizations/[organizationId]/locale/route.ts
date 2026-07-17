import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateOrganizationLocaleSchema } from "@/lib/validation/locale";
import { LocalePreferenceService } from "@/lib/services/locale-preference.service";

const service = new LocalePreferenceService();

type Context = {
  params: Promise<{ organizationId: string }>;
};

export async function PUT(
  request: NextRequest,
  route: Context,
) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { organizationId } = await route.params;
    const input =
      updateOrganizationLocaleSchema.parse(
        await request.json(),
      );

    return apiSuccess(
      await service.updateOrganizationLocale(
        context,
        organizationId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
