import { Navbar, Footer, Container } from "@/components/layout";
import {
  AutomationStudioHeader,
  AutomationStats,
  WorkflowBuilder,
  WorkflowLibrary,
  TriggerLibrary,
  ActionLibrary,
  RunMonitor,
  ApprovalRules,
  TemplateGallery,
  WorkflowAuditLogs,
} from "@/components/automation";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px"}}><AutomationStudioHeader/><AutomationStats/><section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 380px",gap:28,alignItems:"start"}}><div style={{display:"grid",gap:28}}><WorkflowBuilder/><WorkflowLibrary/><RunMonitor/></div><aside style={{display:"grid",gap:24}}><ApprovalRules/><TriggerLibrary/><ActionLibrary/></aside></section></main></Container><Footer/></>}