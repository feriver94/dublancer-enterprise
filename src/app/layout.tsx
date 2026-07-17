import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getLocaleContext } from "@/lib/locale/request-locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dublancer | AI Operating System for Freelancers",
  description: "Dublancer combines Marketplace, AI Copilot and Workspace into one intelligent platform.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocaleContext();
  const messages = await getMessages();

  return (
    <html lang={locale.locale} dir={locale.direction} data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        <LocaleProvider locale={locale.locale} messages={messages} timeZone={locale.timezone}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
