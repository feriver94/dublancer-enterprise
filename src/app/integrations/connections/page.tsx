import { Navbar, Footer, Container } from "@/components/layout";
import { IntegrationsHeader, IntegrationsStats, ConnectorCatalog, ConnectionManager, WebhookOperations, CredentialManagement, SyncOrchestration, ConnectorObservability, IntegrationGovernance, DeveloperPlatform, IntegrationsAI } from "@/components/integrations";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><ConnectionManager/><ConnectorObservability/></main></Container><Footer/></>}
