import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseIntegrationsClient } from "@/components/integrations";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function Page() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canManage =
    authorization.isPlatformAdmin || authorization.permissions.includes("integrations.manage");
  const canExecute =
    authorization.isPlatformAdmin || authorization.permissions.includes("integrations.execute");
  return <><Navbar/><Container><EnterpriseIntegrationsClient canManage={canManage} canExecute={canExecute}/></Container><Footer/></>;
}
