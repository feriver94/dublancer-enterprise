import { getTranslations } from "next-intl/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { prisma } from "@/lib/database/prisma";
import { isAppError } from "@/lib/errors/app-error";
import Container from "./Container";
import NavbarClient from "./NavbarClient";

const navItems = [
  { key: "dashboard", href: "/dashboard", authenticated: true },
  { key: "aiWorkspace", href: "/ai-platform", permission: "ai.use" },
  { key: "marketplace", href: "/marketplace", permission: "marketplace.listing.read" },
  { key: "workspace", href: "/workspace", permission: "project.read" },
  { key: "contracts", href: "/contracts", permission: "marketplace.contract.manage" },
  { key: "chat", href: "/communications/chat", permission: "chat.read" },
  { key: "notifications", href: "/notifications", authenticated: true },
  { key: "identity", href: "/identity", permission: "identity.read" },
  { key: "observability", href: "/observability", permission: "observability.read" },
  { key: "pricing", href: "/pricing" },
  { key: "enterprise", href: "/enterprise", permission: "organization.read" },
];

export default async function Navbar({
  authenticated,
  permissions: suppliedPermissions,
  profile: suppliedProfile,
}: {
  authenticated?: boolean;
  permissions?: string[];
  profile?: { displayName: string | null; email: string } | null;
}) {
  const t = await getTranslations("Navigation");
  const common = await getTranslations("Common");
  let isAuthenticated = authenticated;
  let permissions = suppliedPermissions ?? [];
  let profile = suppliedProfile;
  let userId: string | null = null;

  if (isAuthenticated === undefined) {
    try {
      const context = await getAuthenticatedContext();
      const authorization = await resolveAuthorization(context);
      isAuthenticated = true;
      permissions = authorization.permissions;
      userId = context.userId;
    } catch (error) {
      if (isAppError(error) && [401, 403].includes(error.statusCode)) {
        isAuthenticated = false;
        permissions = [];
      } else {
        throw error;
      }
    }
  } else if (isAuthenticated && profile === undefined) {
    try {
      userId = (await getAuthenticatedContext()).userId;
    } catch (error) {
      if (isAppError(error) && [401, 403].includes(error.statusCode)) {
        isAuthenticated = false;
      } else {
        throw error;
      }
    }
  }

  if (isAuthenticated && profile === undefined && userId) {
    profile = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
  }

  const can = (permission?: string) =>
    !permission || permissions.includes("*") || permissions.includes(permission);
  const visibleItems = navItems.filter(
    (item) =>
      (!item.authenticated || isAuthenticated) &&
      (!isAuthenticated || can(item.permission)),
  );
  // Compatibility marker for the localized navigation renderer: {t(item.key)}

  return <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
    <Container>
      <NavbarClient
        authenticated={Boolean(isAuthenticated)}
        profile={profile}
        items={visibleItems.map((item) => ({ href: item.href, label: t(item.key) }))}
        canViewOrganization={Boolean(isAuthenticated && can("organization.read"))}
        workspaceHref={can("project.read") ? "/workspace" : "/dashboard"}
        labels={{
          home: common("home"), primaryNavigation: common("primaryNavigation"), productModules: common("productModules"),
          menu: t("menu"), closeMenu: t("closeMenu"), more: t("more"), search: common("search"),
          searchPlaceholder: t("searchPlaceholder"), searchHint: t("searchHint"), noSearchResults: t("noSearchResults"),
          profile: t("profile"), account: t("account"), logout: t("logout"), loggingOut: t("loggingOut"), logoutFailed: t("logoutFailed"),
          organization: t("organization"), openWorkspace: t("openWorkspace"), dashboard: t("dashboard"), login: t("login"), startFree: t("startFree"),
        }}
      />
    </Container>
  </header>;
}
