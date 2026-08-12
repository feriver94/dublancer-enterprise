import { AuthenticatedShell, Container } from "@/components/layout";
import PaymentsClient from "@/components/payments/PaymentsClient";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function PaymentsPage() {
  const context = await getAuthenticatedContext();
  const authorization = await resolveAuthorization(context);
  const canManage = context.activePersonaType !== "FREELANCER" && (authorization.isPlatformAdmin || authorization.permissions.includes("finance.manage"));
  return <AuthenticatedShell returnTo="/payments"><Container className="payments-shell" maxWidth="1440px"><PaymentsClient canManage={canManage} activePersonaType={context.activePersonaType} /></Container></AuthenticatedShell>;
}
