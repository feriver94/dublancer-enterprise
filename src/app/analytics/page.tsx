import { getAuthenticatedContext } from "@/lib/auth/session";
import { resolveAuthorization } from "@/lib/authorization/permission-resolver";
import { Container, Footer, Navbar } from "@/components/layout";
import { AnalyticsDashboardClient } from "@/components/analytics";

export default async function AnalyticsPage() {
  const authorization = await resolveAuthorization(await getAuthenticatedContext());
  const canBackfill = authorization.isPlatformAdmin || authorization.permissions.includes("platform.operations.read");
  return <><Navbar/><Container><AnalyticsDashboardClient canBackfill={canBackfill}/></Container><Footer/></>;
}
