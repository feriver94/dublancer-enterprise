import { AuthenticatedShell, Container } from "@/components/layout";
import MarketplaceClient from "@/components/marketplace/MarketplaceClient";
import { getAuthenticatedContext } from "@/lib/auth/session";

export default async function MarketplacePage() {
  const context = await getAuthenticatedContext();
  return <AuthenticatedShell returnTo="/marketplace"><Container><MarketplaceClient activePersonaType={context.activePersonaType} /></Container></AuthenticatedShell>;
}
