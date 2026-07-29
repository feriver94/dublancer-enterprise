import { Navbar, Footer, Container } from "@/components/layout";
import { TalentResourceClient } from "@/components/talent";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";

export default async function Page() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canManage =
    authorization.isPlatformAdmin || authorization.permissions.includes("talent.manage");
  return <><Navbar/><Container><TalentResourceClient canManage={canManage}/></Container><Footer/></>;
}
