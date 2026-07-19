import { AuthenticatedShell, Container } from "@/components/layout";
import ChatWorkspaceClient from "@/components/chat/ChatWorkspaceClient";

export default function ChatPage() {
  return (
    <AuthenticatedShell returnTo="/communications/chat">
      <Container>
        <ChatWorkspaceClient />
      </Container>
    </AuthenticatedShell>
  );
}
