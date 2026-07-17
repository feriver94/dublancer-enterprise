import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Active Subscriptions","12.8k","success"],["Monthly Recurring Revenue","$486k","success"],["Usage Events","84.2M","info"],["Invoice Success","99.3%","success"],["Recovery Rate","87%","neutral"],["Revenue Leakage","0.4%","info"]];
export default function BillingRuntimeStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
