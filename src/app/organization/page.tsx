import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseAdministrationClient } from "@/components/organization";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function OrganizationPage() {
  const context = await getAuthenticatedContext();
  const authorization = await resolveAuthorization(context);
  const can = (permission: string) =>
    authorization.isPlatformAdmin ||
    authorization.permissions.includes(permission);
  return (
    <>
      <Navbar /><Container><EnterpriseAdministrationClient organizationId={context.organizationId} capabilities={{ manageBilling: can("billing.manage"), manageMembers: can("organization.members.manage"), reviewSecurity: can("security.events.manage") }} /></Container><Footer />
    </>
  );
}
