import { Navbar, Footer, Container } from "@/components/layout";
import { AIPlatformHeader, AIPlatformStats, AgentRegistry, MultiAgentOrchestrator, ToolRegistry, MemoryManager, PromptVersionManager, ModelRoutingEngine, HumanApprovalQueue, ExecutionObservability, AIPlatformArchitect } from "@/components/ai-platform";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><AIPlatformStats/><AgentRegistry/><AIPlatformArchitect/></main></Container><Footer/></>}
