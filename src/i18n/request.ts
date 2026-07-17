import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isAppLocale,
} from "./config";

export default getRequestConfig(async () => {
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

  return {
    locale,
    messages: (
      await import(`../../messages/${locale}.json`)
    ).default,
    timeZone: "Asia/Dubai",
    now: new Date(),
  };
});
