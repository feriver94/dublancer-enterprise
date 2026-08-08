import { AuthenticatedShell, Container } from "@/components/layout";
import ProfileSettingsClient from "@/components/profile/ProfileSettingsClient";

export default function ProfileSettingsPage() {
  return <AuthenticatedShell returnTo="/settings/profiles"><Container><ProfileSettingsClient /></Container></AuthenticatedShell>;
}
