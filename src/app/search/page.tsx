import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { Container, Footer, Navbar } from "@/components/layout";
import { SearchProductClient } from "@/components/search";

export default async function SearchPage() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canReindex = authorization.isPlatformAdmin || authorization.permissions.includes("platform.operations.read");
  return <><Navbar/><Container><SearchProductClient canReindex={canReindex}/></Container><Footer/></>;
}
