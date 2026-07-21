import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseOperationsClient } from "@/components/admin";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function Page() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const can = (permission: string) => authorization.isPlatformAdmin || authorization.permissions.includes(permission);
  const capabilities = { manageJobs: can("platform.operations.manage"), manageSecurity: can("security.events.manage"), manageModeration: can("moderation.manage"), manageSupport: can("support.manage"), manageRetention: can("compliance.manage"), exportData: can("data.export") };
  return <><Navbar/><Container><EnterpriseOperationsClient initialTab="jobs" capabilities={capabilities}/></Container><Footer/></>;
}
