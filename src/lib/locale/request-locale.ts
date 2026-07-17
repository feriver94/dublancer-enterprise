import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_METADATA,
  isAppLocale,
  type AppLocale,
} from "@/i18n/config";

export type LocaleContext = {
  locale: AppLocale;
  direction: "ltr" | "rtl";
  timezone: string;
  currency: string;
  jurisdiction: "AE";
};

export async function getLocaleContext(): Promise<LocaleContext> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  const cookieLocale =
    cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const headerLocale =
    requestHeaders.get("x-dublancer-locale");

  const locale = isAppLocale(cookieLocale)
    ? cookieLocale
    : isAppLocale(headerLocale)
      ? headerLocale
      : DEFAULT_LOCALE;

  const metadata = LOCALE_METADATA[locale];

  return {
    locale,
    direction: metadata.direction,
    timezone: metadata.timezone,
    currency: metadata.currency,
    jurisdiction: "AE",
  };
}
