import { Navbar, Footer, Container } from "@/components/layout";
import { KnowledgeManagementClient } from "@/components/knowledge";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function KnowledgePage() {
  const context = await getAuthenticatedContext();
  const authorization = await resolveAuthorization(context);
  const canManage =
    authorization.isPlatformAdmin || authorization.permissions.includes("knowledge.manage");
  const canApprove =
    authorization.isPlatformAdmin || authorization.permissions.includes("knowledge.approve");
  return <><Navbar/><Container><KnowledgeManagementClient currentUserId={context.userId} canManage={canManage} canApprove={canApprove}/></Container><Footer/></>;
}
