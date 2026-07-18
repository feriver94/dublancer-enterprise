import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { isAppError } from "@/lib/errors/app-error";
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
  try {
    const context = await getAuthenticatedContext();
    permissions = (await resolveAuthorization(context)).permissions;
  } catch (error) {
    if (isAppError(error) && [401, 403].includes(error.statusCode)) {
      redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
    }
    throw error;
  }

  return (
    <>
      <Navbar authenticated permissions={permissions} />
      {children}
      <Footer />
    </>
  );
}
