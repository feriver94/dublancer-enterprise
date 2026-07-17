import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { updateLocalePreferenceSchema } from "@/lib/validation/locale";
import { LocalePreferenceService } from "@/lib/services/locale-preference.service";
import { LOCALE_COOKIE_NAME } from "@/i18n/config";

const service = new LocalePreferenceService();

export async function PUT(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { locale } =
      updateLocalePreferenceSchema.parse(
        await request.json(),
      );

    const user = await service.updateUserLocale(
      context.userId,
      locale,
    );

    const store = await cookies();
    store.set(LOCALE_COOKIE_NAME, locale, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}
