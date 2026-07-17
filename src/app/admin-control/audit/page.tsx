import { Navbar, Footer, Container } from "@/components/layout";
import { AdminControlHeader, AdminControlStats, TenantOperations, FeatureFlagConsole, PolicyManagement, AuditEvidenceCenter, CompliancePrograms, PrivilegedAccessReview, DataGovernanceCenter, ServiceControlCenter, AdminControlAI } from "@/components/admin-control";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><AuditEvidenceCenter/><PrivilegedAccessReview/></main></Container><Footer/></>}
