"use client";

import type { ReactNode } from "react";
import {
  NextIntlClientProvider,
  type AbstractIntlMessages,
} from "next-intl";
import type { AppLocale } from "@/i18n/config";

type Props = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
  timeZone?: string;
};

export function LocaleProvider({
  children,
  locale,
  messages,
  timeZone = "Asia/Dubai",
}: Props) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
