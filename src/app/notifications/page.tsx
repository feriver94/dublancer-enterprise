import { AuthenticatedShell, Container } from "@/components/layout";
import NotificationInboxClient from "@/components/notifications/NotificationInboxClient";

export default function NotificationsPage() {
  return (
    <AuthenticatedShell returnTo="/notifications">
      <Container>
        <NotificationInboxClient />
      </Container>
    </AuthenticatedShell>
  );
}
