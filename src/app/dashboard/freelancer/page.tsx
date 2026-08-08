import { AuthenticatedShell, Container } from "@/components/layout";
import PhaseBDashboardClient from "@/components/profile/PhaseBDashboardClient";

export default function FreelancerDashboardPage() {
  return <AuthenticatedShell returnTo="/dashboard/freelancer"><Container><PhaseBDashboardClient mode="freelancer" /></Container></AuthenticatedShell>;
}
