import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui";
import { brand } from "@/constants/design";
import Container from "./Container";

const navItems = [
  { label: "AI Copilot", href: "/ai-copilot" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Workspace", href: "/workspace" },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", href: "/enterprise" },
];

export default function Navbar() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: `1px solid ${brand.colors.border}`,
        background: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Container>
        <nav
          style={{
            minHeight: "96px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <Image
            src="/images/Logo.jpg"
            alt="Dublancer"
            width={300}
            height={95}
            priority
            sizes="300px"
            style={{
             width: "300px",
             height: "95px",
             objectFit: "contain",
             display: "block",
             }}
            />
          </Link>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "36px",
              color: brand.colors.navy,
              fontSize: "16px",
              fontWeight: 700,
              flex: 1,
              whiteSpace: "nowrap",
            }}
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  color: brand.colors.navy,
                  textDecoration: "none",
                  transition: brand.transition.default,
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px",
              flexShrink: 0,
            }}
          >
            <Link
              href="/login"
              style={{
                color: brand.colors.navy,
                textDecoration: "none",
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              Login
            </Link>

            <Button variant="primary">Start Free</Button>
          </div>
        </nav>
      </Container>
    </header>
  );
}