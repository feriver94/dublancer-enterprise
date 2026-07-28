import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseIdentityClient } from "@/components/identity";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function IdentityPage() {
  const context = await getAuthenticatedContext();
  const authorization = await resolveAuthorization(context);
  const canManage =
    authorization.isPlatformAdmin ||
    authorization.permissions.includes("identity.manage");
  return (
    <>
      <Navbar />
      <Container>
        <EnterpriseIdentityClient
          organizationId={context.organizationId}
          canManage={canManage}
        />
      </Container>
      <Footer />
    </>
  );
}
