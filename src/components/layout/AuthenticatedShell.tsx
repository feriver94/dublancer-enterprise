import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { isAppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/database/prisma";
import Navbar from "./Navbar";
import Footer from "./Footer";

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export default async function AuthenticatedShell({
  children,
  returnTo,
}: {
  children: ReactNode;
  returnTo: string;
}) {
  let permissions: string[];
  let profile: { displayName: string | null; email: string } | null;
  let personas: Array<{ id: string; type: "CLIENT" | "FREELANCER" | "ORGANIZATION"; label: string; organizationName: string }> = [];
  let activePersonaId: string | null = null;
  try {
    const context = await getAuthenticatedContext();
    activePersonaId = context.activePersonaId ?? null;
    [permissions, profile, personas] = await Promise.all([
      resolveAuthorization(context).then((authorization) => authorization.permissions),
      prisma.user.findUnique({ where: { id: context.userId }, select: { displayName: true, email: true } }),
      prisma.accountPersona.findMany({
        where: { userId: context.userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        select: { id: true, type: true, label: true, organization: { select: { name: true } } },
        orderBy: [{ lastUsedAt: "desc" }, { type: "asc" }],
      }).then((items) => items.map((item) => ({ id: item.id, type: item.type, label: item.label, organizationName: item.organization.name }))),
    ]);
  } catch (error) {
    if (isAppError(error) && [401, 403].includes(error.statusCode)) {
      redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
    }
    throw error;
  }

  return (
    <>
      <Navbar authenticated permissions={permissions} profile={profile} personas={personas} activePersonaId={activePersonaId} />
      {children}
      <Footer />
    </>
  );
}
