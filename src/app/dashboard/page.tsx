import { AuthenticatedShell, Container } from "@/components/layout";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default function DashboardPage() {
  return <AuthenticatedShell returnTo="/dashboard"><Container><DashboardClient /></Container></AuthenticatedShell>;
}
