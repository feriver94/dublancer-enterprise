import { AuthenticatedShell, Container } from "@/components/layout";
import MarketplaceClient from "@/components/marketplace/MarketplaceClient";
import { getAuthenticatedContext } from "@/lib/auth/session";

export default async function MarketplaceProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, context] = await Promise.all([params, getAuthenticatedContext()]);
  return <AuthenticatedShell returnTo={`/marketplace/project/${id}`}><Container><MarketplaceClient listingId={id} activePersonaType={context.activePersonaType} /></Container></AuthenticatedShell>;
}
