import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/i18n/config";

export const updateLocalePreferenceSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export const updateOrganizationLocaleSchema = z.object({
  defaultLocale: z.enum(SUPPORTED_LOCALES),
  supportedLocales: z
    .array(z.enum(SUPPORTED_LOCALES))
    .min(1)
    .max(SUPPORTED_LOCALES.length),
});
