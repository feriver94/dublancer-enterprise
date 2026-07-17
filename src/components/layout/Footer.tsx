import Link from "next/link";
import { brand } from "@/constants/design";
import Container from "./Container";

const footerLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
];

export default function Footer() {
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
            {brand.tagline}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-5 text-sm font-semibold"
          style={{ color: brand.colors.navy }}
        >
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} style={{ transition: brand.transition.default }}>
              {item.label}
            </Link>
          ))}
        </div>
      </Container>
    </footer>
  );
}
