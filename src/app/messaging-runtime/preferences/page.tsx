import { Navbar, Footer, Container } from "@/components/layout";
import { MessagingRuntimeHeader, MessagingRuntimeStats, ChannelRegistry, TemplateStudio, DeliveryOrchestrator, PreferenceCenter, DeliveryObservability, RetryFailureConsole, ComplianceControls, ProviderHealth, MessagingRuntimeAI } from "@/components/messaging-runtime";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><PreferenceCenter/><ComplianceControls/></main></Container><Footer/></>}
