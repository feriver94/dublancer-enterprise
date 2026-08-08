import { AuthenticatedShell, Container } from "@/components/layout";
import ProfileSettingsClient from "@/components/profile/ProfileSettingsClient";
import AiProfileAssistant from "@/components/profile/AiProfileAssistant";

export default function ProfileSettingsPage() {
  return <AuthenticatedShell returnTo="/settings/profiles"><Container><ProfileSettingsClient /><AiProfileAssistant /></Container></AuthenticatedShell>;
}
