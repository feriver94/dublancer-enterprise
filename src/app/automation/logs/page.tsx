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
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px"}}><WorkflowAuditLogs/></main></Container><Footer/></>}