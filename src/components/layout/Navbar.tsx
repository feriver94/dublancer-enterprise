import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/constants/design";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { isAppError } from "@/lib/errors/app-error";
import Container from "./Container";

const navItems = [
  { key: "dashboard", href: "/dashboard", authenticated: true },
  { key: "aiWorkspace", href: "/ai-copilot", permission: "ai.use" },
  { key: "marketplace", href: "/marketplace", permission: "marketplace.listing.read" },
  { key: "workspace", href: "/workspace", permission: "project.read" },
  { key: "contracts", href: "/contracts", permission: "marketplace.contract.manage" },
  { key: "chat", href: "/communications/chat", permission: "chat.read" },
  { key: "notifications", href: "/notifications", authenticated: true },
  { key: "pricing", href: "/pricing" },
  { key: "enterprise", href: "/enterprise", permission: "organization.read" },
];

export default async function Navbar({
  authenticated,
  permissions: suppliedPermissions,
}: {
  authenticated?: boolean;
  permissions?: string[];
}) {
  const t = await getTranslations("Navigation");
  const common = await getTranslations("Common");
  let isAuthenticated = authenticated;
  let permissions = suppliedPermissions ?? [];

  if (isAuthenticated === undefined) {
    try {
      const context = await getAuthenticatedContext();
      const authorization = await resolveAuthorization(context);
      isAuthenticated = true;
      permissions = authorization.permissions;
    } catch (error) {
      if (isAppError(error) && [401, 403].includes(error.statusCode)) {
        isAuthenticated = false;
        permissions = [];
      } else {
        throw error;
      }
    }
  }

  const can = (permission?: string) =>
    !permission || permissions.includes("*") || permissions.includes(permission);
  const visibleItems = navItems.filter(
    (item) =>
      (!item.authenticated || isAuthenticated) &&
      (!isAuthenticated || can(item.permission)),
  );

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <Container>
        <nav className="flex min-h-24 flex-wrap items-center justify-between gap-5 py-3" aria-label={common("primaryNavigation")}>
          <Link href={isAuthenticated ? "/dashboard" : "/"} className="shrink-0" aria-label={common("home")}>
            <Image src="/images/Logo.jpg" alt="Dublancer" width={230} height={74} priority className="h-auto w-[190px] object-contain lg:w-[230px]" />
          </Link>
          <div className="order-3 flex w-full items-center gap-5 overflow-x-auto text-sm font-bold text-[#0F4C5C] lg:order-none lg:w-auto lg:flex-1 lg:justify-center" aria-label={common("productModules")}>
            {visibleItems.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-[#009A44]">
                {t(item.key)}
              </Link>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isAuthenticated ? (
              <>
                {can("organization.read") ? <Link href="/organization" className="font-bold text-[#0F4C5C]">{t("organization")}</Link> : null}
                <Link href={can("project.read") ? "/workspace" : "/dashboard"} className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#007A36]">
                  {can("project.read") ? t("openWorkspace") : t("dashboard")}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="font-bold text-[#0F4C5C]">{t("login")}</Link>
                <Link href="/register" className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#007A36]">{t("startFree")}</Link>
              </>
            )}
          </div>
        </nav>
      </Container>
    </header>
  );
}
