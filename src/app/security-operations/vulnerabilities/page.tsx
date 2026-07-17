import { Navbar, Footer, Container } from "@/components/layout";
import { SecurityOperationsHeader, SecurityOperationsStats, IncidentCommand, ThreatDetectionCenter, DeviceSecurity, VulnerabilityManagement, IdentityThreatProtection, AutomatedResponse, ThreatIntelligence, SecurityEvidence, SecurityOperationsAI } from "@/components/security-operations";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><VulnerabilityManagement/><SecurityOperationsAI/></main></Container><Footer/></>}
