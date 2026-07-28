import { Navbar, Footer, Container } from "@/components/layout";
import { ReliabilityDashboardClient } from "@/components/admin";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function ObservabilityPage() {
  const context = await getAuthenticatedContext();
  const authorization = await resolveAuthorization(context);
  const canManage =
    authorization.isPlatformAdmin ||
    authorization.permissions.includes("observability.manage");
  return (
    <>
      <Navbar />
      <Container>
        <ReliabilityDashboardClient canManage={canManage} />
      </Container>
      <Footer />
    </>
  );
}
