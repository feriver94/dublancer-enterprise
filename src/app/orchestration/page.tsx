import { Container, Footer, Navbar } from "@/components/layout";
import OrchestrationClient from "@/components/orchestration/OrchestrationClient";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function OrchestrationPage() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const can = (permission: string) =>
    authorization.isPlatformAdmin || authorization.permissions.includes(permission);
  return (
    <>
      <Navbar />
      <Container>
        <OrchestrationClient
          canManage={can("orchestration.manage")}
          canRun={can("orchestration.run")}
          canApprove={can("orchestration.approve")}
        />
      </Container>
      <Footer />
    </>
  );
}
