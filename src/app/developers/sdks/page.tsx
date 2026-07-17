import { Navbar, Footer, Container } from "@/components/layout";
import { DeveloperHeader, DeveloperStats, ApiExplorer, SDKLibrary, ApiKeysConsole, WebhookDocs, SandboxEnvironment, RateLimitMonitor, DeveloperLogs } from "@/components/developers";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px"}}><SDKLibrary/></main></Container><Footer/></>}