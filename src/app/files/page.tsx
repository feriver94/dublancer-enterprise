import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { Container, Footer, Navbar } from "@/components/layout";
import { FileBrowserClient } from "@/components/files";

export default async function FilesPage() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canManage = authorization.isPlatformAdmin || authorization.permissions.includes("files.manage");
  return <><Navbar/><Container><FileBrowserClient canManage={canManage}/></Container><Footer/></>;
}
