import { Navbar, Footer, Container } from "@/components/layout";
import { ComplianceRuntimeHeader, ComplianceRuntimeStats, PolicyDecisionPoint, ControlMonitoring, EvidencePipeline, ExceptionManagement, PrivacyOperations, AttestationCenter, RiskRegisterRuntime, RemediationTracker, ComplianceRuntimeAI } from "@/components/compliance-runtime";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><PolicyDecisionPoint/><ComplianceRuntimeAI/></main></Container><Footer/></>}
