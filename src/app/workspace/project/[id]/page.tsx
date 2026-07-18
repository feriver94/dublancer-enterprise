import { AuthenticatedShell, Container } from "@/components/layout";
import WorkspaceClient from "@/components/workspace/WorkspaceClient";
export default async function WorkspaceProjectPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return <AuthenticatedShell returnTo={`/workspace/project/${id}`}><Container><WorkspaceClient projectId={id} /></Container></AuthenticatedShell>}
