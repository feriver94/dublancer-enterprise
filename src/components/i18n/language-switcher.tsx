"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import {
  ARABIC_LOCALE,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type AppLocale,
} from "@/i18n/config";

function setLocaleCookie(locale: AppLocale) {
  document.cookie = [
    `${LOCALE_COOKIE_NAME}=${locale}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
  ].join("; ");
}

export function LanguageSwitcher() {
  const locale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();

  const nextLocale =
    locale === ARABIC_LOCALE
      ? DEFAULT_LOCALE
      : ARABIC_LOCALE;

  function switchLanguage() {
    startTransition(async () => {
      setLocaleCookie(nextLocale);

      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => undefined);
      const csrfBody = csrfResponse?.ok
        ? await csrfResponse.json() as { data?: { csrfToken?: string } }
        : undefined;

      await fetch("/api/me/locale", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(csrfBody?.data?.csrfToken
            ? { "x-csrf-token": csrfBody.data.csrfToken }
            : {}),
        },
        body: JSON.stringify({
          locale: nextLocale,
        }),
      }).catch(() => undefined);

      window.location.reload();
    });
  }

  return (
    <button
      type="button"
      onClick={switchLanguage}
      disabled={pending}
      aria-label={
        nextLocale === ARABIC_LOCALE
          ? "Switch to Arabic"
          : "Switch to English"
      }
      className="locale-switcher"
    >
      {nextLocale === ARABIC_LOCALE
        ? "العربية"
        : "English"}
    </button>
  );
}
