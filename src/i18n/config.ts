export const SUPPORTED_LOCALES = ["en-AE", "ar-AE"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-AE";
export const ARABIC_LOCALE: AppLocale = "ar-AE";
export const LOCALE_COOKIE_NAME = "dublancer_locale";

export const LOCALE_METADATA: Record<
  AppLocale,
  {
    label: string;
    nativeLabel: string;
    direction: "ltr" | "rtl";
    languageTag: string;
    timezone: string;
    currency: string;
  }
> = {
  "en-AE": {
    label: "English",
    nativeLabel: "English",
    direction: "ltr",
    languageTag: "en-AE",
    timezone: "Asia/Dubai",
    currency: "AED",
  },
  "ar-AE": {
    label: "Arabic",
    nativeLabel: "العربية",
    direction: "rtl",
    languageTag: "ar-AE",
    timezone: "Asia/Dubai",
    currency: "AED",
  },
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.includes(value as AppLocale)
  );
}

export function getLocaleDirection(locale: AppLocale) {
  return LOCALE_METADATA[locale].direction;
}
