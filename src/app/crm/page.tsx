import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseCrmClient } from "@/components/crm";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function Page() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canManage =
    authorization.isPlatformAdmin || authorization.permissions.includes("crm.manage");
  return <><Navbar/><Container><EnterpriseCrmClient canManage={canManage}/></Container><Footer/></>;
}
