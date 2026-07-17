import { Navbar, Footer, Container } from "@/components/layout";
import { ConnectorRuntimeHeader, ConnectorRuntimeStats, OAuthInstallationManager, WebhookGateway, SyncRuntime, ConnectorActionRuntime, RateLimitManager, SchemaMappingEngine, ConnectorSDK, ConnectorMonitoring, ConnectorRuntimeAI } from "@/components/connector-runtime";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><SyncRuntime/><SchemaMappingEngine/><RateLimitManager/></main></Container><Footer/></>}
