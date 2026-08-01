import { AuthenticatedShell } from "@/components/layout";
import EnterpriseControlCenterClient from "@/components/enterprise/EnterpriseControlCenterClient";

export default function EnterprisePage() {
  return (
    <AuthenticatedShell returnTo="/enterprise">
      <EnterpriseControlCenterClient />
    </AuthenticatedShell>
  );
}
