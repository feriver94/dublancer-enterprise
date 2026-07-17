import { Navbar, Footer, Container } from "@/components/layout";
import { KnowledgePlatformHeader, KnowledgePlatformStats, KnowledgeGraphExplorer, EnterpriseMemory, DocumentIndex, SemanticSearch, EntityResolution, KnowledgeGovernance, RetrievalQuality, KnowledgePlatformAI } from "@/components/knowledge-platform";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><KnowledgePlatformAI/><RetrievalQuality/></main></Container><Footer/></>}
