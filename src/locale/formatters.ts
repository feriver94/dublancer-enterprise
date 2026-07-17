import type { AppLocale } from "@/i18n/config";

const UAE_TIMEZONE = "Asia/Dubai";
const UAE_CURRENCY = "AED";

export function formatUaeDate(
  value: Date | string | number,
  locale: AppLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: UAE_TIMEZONE,
  }).format(new Date(value));
}

export function formatUaeDateTime(
  value: Date | string | number,
  locale: AppLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: UAE_TIMEZONE,
  }).format(new Date(value));
}

export function formatAed(
  value: number,
  locale: AppLocale,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: UAE_CURRENCY,
    currencyDisplay: "symbol",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(
  value: number,
  locale: AppLocale,
) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}
