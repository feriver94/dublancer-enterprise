import { AuthenticatedShell, Container } from "@/components/layout";
import ContractsClient from "@/components/contracts/ContractsClient";
import { getAuthenticatedContext } from "@/lib/auth/session";

export default async function ContractsPage() {
  const context = await getAuthenticatedContext();
  return <AuthenticatedShell returnTo="/contracts"><Container><ContractsClient activePersonaType={context.activePersonaType} /></Container></AuthenticatedShell>;
}
