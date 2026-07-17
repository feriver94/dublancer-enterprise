import { Navbar, Footer, Container } from "@/components/layout";
import { CommunicationsHeader, CommunicationsStats, UnifiedInbox, TeamChat, MeetingIntelligence, VoiceVideoOperations, ActionItemRouter, CommunicationGovernance, ChannelIntegrations, CommunicationHealth, CommunicationsAI } from "@/components/communications";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><CommunicationsStats/><UnifiedInbox/><CommunicationHealth/></main></Container><Footer/></>}
