import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import type { PlatformPermission } from "@/lib/authorization/permissions";
import { isAppError } from "@/lib/errors/app-error";

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default async function ProductRouteGuard({
  children,
  returnTo,
  permission,
}: {
  children: ReactNode;
  returnTo: string;
  permission?: PlatformPermission;
}) {
  try {
    const context = await getAuthenticatedContext();
    const authorization = await resolveAuthorization(context);
    const permitted =
      !permission ||
      authorization.isPlatformAdmin ||
      authorization.permissions.includes(permission);

    if (!permitted) {
      redirect(
        `/dashboard?accessDenied=${encodeURIComponent(permission)}&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`,
      );
    }
  } catch (error) {
    if (isAppError(error) && [401, 403].includes(error.statusCode)) {
      redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
    }
    throw error;
  }

  return children;
}
