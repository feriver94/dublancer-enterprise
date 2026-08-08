import { AuthenticatedShell, Container } from "@/components/layout";
import MarketplaceClient from "@/components/marketplace/MarketplaceClient";
import { getAuthenticatedContext } from "@/lib/auth/session";

export default async function MarketplaceProfilePage() {
  const context = await getAuthenticatedContext();
  return <AuthenticatedShell returnTo="/marketplace/profile"><Container><MarketplaceClient profile activePersonaType={context.activePersonaType} /></Container></AuthenticatedShell>;
}
