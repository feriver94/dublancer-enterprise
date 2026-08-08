import { AuthenticatedShell, Container } from "@/components/layout";
import PhaseBDashboardClient from "@/components/profile/PhaseBDashboardClient";

export default function ClientDashboardPage() {
  return <AuthenticatedShell returnTo="/dashboard/client"><Container><PhaseBDashboardClient mode="client" /></Container></AuthenticatedShell>;
}
