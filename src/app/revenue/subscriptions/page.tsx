import { Navbar, Footer, Container } from "@/components/layout";
import { RevenueHeader, RevenueStats, BillingOverview, SubscriptionPlans, InvoiceCenter, UsageMetering, RevenueForecast, CollectionsQueue, RevenueAI } from "@/components/revenue";
export default function Page(){return <><Navbar/><Container><main style={{padding:"72px 0 96px"}}><SubscriptionPlans/></main></Container><Footer/></>}