import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/constants/design";
import Container from "./Container";

const footerLinks = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "security", href: "/security" },
  { key: "contact", href: "/contact" },
];

export default async function Footer() {
  const t = await getTranslations("Footer");
  return (
    <footer
      className="border-t bg-white py-10"
      style={{ borderColor: brand.colors.border }}
    >
      <Container className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="font-bold" style={{ color: brand.colors.navy }}>
            {brand.name} © 2026
          </p>
          <p className="mt-1 text-sm" style={{ color: brand.colors.muted }}>
            {t("tagline")}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-5 text-sm font-semibold"
          style={{ color: brand.colors.navy }}
        >
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} style={{ transition: brand.transition.default }}>
            {t(item.key)}
            </Link>
          ))}
        </div>
      </Container>
    </footer>
  );
}
