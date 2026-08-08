import { getTranslations } from "next-intl/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { prisma } from "@/lib/database/prisma";
import { isAppError } from "@/lib/errors/app-error";
import Container from "./Container";
import NavbarClient from "./NavbarClient";

type NavItem = { key: string; href: string; authenticated?: boolean; permission?: string };

const publicNavItems: NavItem[] = [
  { key: "pricing", href: "/pricing" },
];

const commonNavItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard", authenticated: true },
  { key: "notifications", href: "/notifications", authenticated: true },
  { key: "aiWorkspace", href: "/ai-platform", permission: "ai.use" },
  { key: "identity", href: "/identity", permission: "identity.read" },
  { key: "observability", href: "/observability", permission: "observability.read" },
  { key: "enterprise", href: "/enterprise", permission: "organization.read" },
];

const clientNavItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard/client", authenticated: true },
  { key: "postProject", href: "/marketplace", permission: "marketplace.listing.manage" },
  { key: "proposals", href: "/marketplace", permission: "marketplace.proposal.review" },
  { key: "contracts", href: "/contracts", permission: "marketplace.contract.manage" },
  { key: "payments", href: "/payments", permission: "finance.read" },
  { key: "workspace", href: "/workspace", permission: "project.read" },
  { key: "chat", href: "/communications/chat", permission: "chat.read" },
  { key: "analytics", href: "/analytics", authenticated: true },
];

const freelancerNavItems: NavItem[] = [
  { key: "dashboard", href: "/dashboard/freelancer", authenticated: true },
  { key: "findWork", href: "/marketplace", permission: "marketplace.listing.read" },
  { key: "invitations", href: "/marketplace?view=invitations", permission: "marketplace.listing.read" },
  { key: "proposals", href: "/marketplace", permission: "marketplace.proposal.submit" },
  { key: "contracts", href: "/contracts", permission: "marketplace.contract.manage" },
  { key: "deliveries", href: "/workspace", permission: "project.read" },
  { key: "earnings", href: "/payments", permission: "finance.read" },
  { key: "chat", href: "/communications/chat", permission: "chat.read" },
  { key: "portfolio", href: "/settings/profiles#portfolio", authenticated: true },
  { key: "analytics", href: "/analytics", authenticated: true },
];

export default async function Navbar({
  authenticated,
  permissions: suppliedPermissions,
  profile: suppliedProfile,
  personas: suppliedPersonas,
  activePersonaId: suppliedActivePersonaId,
}: {
  authenticated?: boolean;
  permissions?: string[];
  profile?: { displayName: string | null; email: string } | null;
  personas?: Array<{ id: string; type: "CLIENT" | "FREELANCER" | "ORGANIZATION"; label: string; organizationName: string }>;
  activePersonaId?: string | null;
}) {
  const t = await getTranslations("Navigation");
  const common = await getTranslations("Common");
  let isAuthenticated = authenticated;
  let permissions = suppliedPermissions ?? [];
  let profile = suppliedProfile;
  let userId: string | null = null;
  let personas = suppliedPersonas ?? [];
  let activePersonaId = suppliedActivePersonaId ?? null;
  let activePersonaType = personas.find((persona) => persona.id === activePersonaId)?.type ?? null;

  if (isAuthenticated === undefined) {
    try {
      const context = await getAuthenticatedContext();
      const authorization = await resolveAuthorization(context);
      isAuthenticated = true;
      permissions = authorization.permissions;
      userId = context.userId;
      activePersonaId = context.activePersonaId ?? null;
      activePersonaType = context.activePersonaType ?? null;
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
    [profile, personas] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } }),
      prisma.accountPersona.findMany({
        where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        select: { id: true, type: true, label: true, organization: { select: { name: true } } },
        orderBy: [{ lastUsedAt: "desc" }, { type: "asc" }],
      }).then((items) => items.map((item) => ({ id: item.id, type: item.type, label: item.label, organizationName: item.organization.name }))),
    ]);
  }

  activePersonaType ??= personas.find((persona) => persona.id === activePersonaId)?.type ?? null;

  const can = (permission?: string) =>
    !permission || permissions.includes("*") || permissions.includes(permission);
  const personaItems = activePersonaType === "FREELANCER"
    ? freelancerNavItems
    : activePersonaType === "CLIENT" || activePersonaType === "ORGANIZATION"
      ? clientNavItems
      : commonNavItems;
  const navItems = isAuthenticated ? [...personaItems, ...commonNavItems.filter((item) => item.key !== "dashboard")] : publicNavItems;
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
        personas={personas}
        activePersonaId={activePersonaId}
        items={visibleItems.map((item) => ({ href: item.href, label: t(item.key) }))}
        canViewOrganization={Boolean(isAuthenticated && can("organization.read"))}
        workspaceHref={can("project.read") ? "/workspace" : "/dashboard"}
        labels={{
          home: common("home"), primaryNavigation: common("primaryNavigation"), productModules: common("productModules"),
          menu: t("menu"), closeMenu: t("closeMenu"), more: t("more"), search: common("search"),
          searchPlaceholder: t("searchPlaceholder"), searchHint: t("searchHint"), noSearchResults: t("noSearchResults"),
          profile: t("profile"), account: t("account"), logout: t("logout"), loggingOut: t("loggingOut"), logoutFailed: t("logoutFailed"),
          activePersona: t("activePersona"), switchPersona: t("switchPersona"), managePersonas: t("managePersonas"), switchingPersona: t("switchingPersona"),
          organization: t("organization"), openWorkspace: t("openWorkspace"), dashboard: t("dashboard"), login: t("login"), startFree: t("startFree"),
        }}
      />
    </Container>
  </header>;
}
