import { Navbar, Footer, Container } from "@/components/layout";
import { AiGovernanceWorkspaceClient } from "@/components/ai-platform";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function Page() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const can = (permission: string) => authorization.isPlatformAdmin || authorization.permissions.includes(permission);
  return <><Navbar/><Container><AiGovernanceWorkspaceClient canManage={can("ai.manage")} canApprove={can("ai.approve")} canAudit={can("audit.read")} /></Container><Footer/></>;
}
