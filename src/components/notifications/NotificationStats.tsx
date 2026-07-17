import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Unread Alerts","28","info"],["Critical Events","4","success"],["Pending Approvals","13","neutral"],["AI Recommendations","42","success"],["Security Signals","7","info"],["SLA Health","98%","success"]];
export default function NotificationStats(){
 return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>
  {stats.map(([l,v,variant])=><Card key={l} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{v}</div></Card>)}
 </section>
}
