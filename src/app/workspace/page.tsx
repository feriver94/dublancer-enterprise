import { AuthenticatedShell, Container } from "@/components/layout";
import WorkspaceClient from "@/components/workspace/WorkspaceClient";
export default function WorkspacePage(){return <AuthenticatedShell returnTo="/workspace"><Container><WorkspaceClient /></Container></AuthenticatedShell>}
