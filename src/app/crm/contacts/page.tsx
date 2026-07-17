import { Navbar, Footer, Container } from "@/components/layout";
import { CRMHeader, CRMStats, AccountDirectory, ContactCenter, DealPipeline, Customer360, HealthScoring, RenewalExpansion, CRMAI } from "@/components/crm";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px"}}><ContactCenter/></main></Container><Footer/></>}