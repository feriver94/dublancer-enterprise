import { AuthenticatedShell, Container } from "@/components/layout";
import PersonaCenterClient from "@/components/account/PersonaCenterClient";

export default function OnboardingPage() {
  return <AuthenticatedShell returnTo="/onboarding"><Container><PersonaCenterClient onboarding /></Container></AuthenticatedShell>;
}
