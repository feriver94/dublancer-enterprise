import Image from "next/image";
import Link from "next/link";
import { brand } from "@/constants/design";
import Container from "./Container";

const navItems = [
  { label: "Dashboard", href: "/dashboard", authenticated: true },
  { label: "AI Copilot", href: "/ai-copilot", permission: "ai.use" },
  { label: "Marketplace", href: "/marketplace", permission: "marketplace.listing.read" },
  { label: "Workspace", href: "/workspace", permission: "project.read" },
  { label: "Contracts", href: "/contracts", permission: "marketplace.contract.manage" },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", href: "/enterprise", permission: "organization.read" },
];

export default function Navbar({
  authenticated = false,
  permissions = [],
}: {
  authenticated?: boolean;
  permissions?: string[];
}) {
  const can = (permission?: string) =>
    !permission || permissions.includes("*") || permissions.includes(permission);
  const visibleItems = navItems.filter(
    (item) =>
      (!item.authenticated || authenticated) &&
      (!authenticated || can(item.permission)),
  );

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <Container>
        <nav className="flex min-h-24 flex-wrap items-center justify-between gap-5 py-3" aria-label="Primary navigation">
          <Link href={authenticated ? "/dashboard" : "/"} className="shrink-0" aria-label="Dublancer home">
            <Image src="/images/Logo.jpg" alt="Dublancer" width={230} height={74} priority className="h-auto w-[190px] object-contain lg:w-[230px]" />
          </Link>
          <div className="order-3 flex w-full items-center gap-5 overflow-x-auto text-sm font-bold text-[#0F4C5C] lg:order-none lg:w-auto lg:flex-1 lg:justify-center" aria-label="Product modules">
            {visibleItems.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-[#009A44]">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {authenticated ? (
              <>
                {can("organization.read") ? <Link href="/organization" className="font-bold text-[#0F4C5C]">Organization</Link> : null}
                <Link href={can("project.read") ? "/workspace" : "/dashboard"} className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#007A36]">
                  {can("project.read") ? "Open Workspace" : "Dashboard"}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="font-bold text-[#0F4C5C]">Login</Link>
                <Link href="/register" className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#007A36]">Start Free</Link>
              </>
            )}
          </div>
        </nav>
      </Container>
    </header>
  );
}
