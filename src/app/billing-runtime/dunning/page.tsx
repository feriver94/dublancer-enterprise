import { Navbar, Footer, Container } from "@/components/layout";
import { BillingRuntimeHeader, BillingRuntimeStats, PlanCatalog, SubscriptionLifecycle, UsageMeteringEngine, EntitlementEngine, InvoiceGeneration, DunningRecovery, RevenueRecognition, BillingAuditControl, BillingRuntimeAI } from "@/components/billing-runtime";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px",display:"grid",gap:28}}><DunningRecovery/><BillingRuntimeAI/></main></Container><Footer/></>}
