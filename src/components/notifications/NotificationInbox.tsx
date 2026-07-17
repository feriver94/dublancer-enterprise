import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const notifications=[["Critical","Security policy changed by Organization Admin","2 minutes ago","security"],["Approval","Milestone release requested for AI Marketplace MVP","14 minutes ago","payments"],["AI","Executive AI detected rising backend capacity risk","32 minutes ago","ai"],["Workspace","Project room received 8 new updates","1 hour ago","workspace"],["CRM","Horizon Digital shows strong upsell signal","Today","crm"],["Billing","Invoice INV-1001 requires follow-up","Today","payments"]];
export default function NotificationInbox(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="info">Unified Inbox</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Priority notifications</h2></div><Button variant="outline">Filter Inbox</Button></div>
  <div style={{display:"grid",gap:12}}>{notifications.map(([type,title,time,source])=><div key={title} style={{display:"grid",gridTemplateColumns:"110px 1fr 130px 120px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><Badge variant={type==="Critical"?"danger":type==="AI"?"success":"info"}>{type}</Badge><strong style={{color:brand.colors.navy}}>{title}</strong><span style={{color:brand.colors.muted}}>{time}</span><Badge variant="neutral">{source}</Badge></div>)}</div>
 </Card>
}
