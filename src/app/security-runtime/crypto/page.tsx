import { Navbar, Footer, Container } from "@/components/layout";
import { SecurityRuntimeHeader, SecurityRuntimeStats, ZeroTrustDecisionEngine, SecretsVault, APISecurityGateway, MachineIdentity, AdaptiveAccess, KeyManagement, TokenSecurity, PrivilegedOperations, SecurityRuntimeAI } from "@/components/security-runtime";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><KeyManagement/><MachineIdentity/></main></Container><Footer/></>}
