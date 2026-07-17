import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["Structured Logs", "API, worker, event, audit logs", "Priority"], ["Metrics", "Latency, success rate, usage, cost", "Priority"], ["Tracing", "End-to-end request and workflow traces", "Designed"], ["Alerts", "SLA, errors, queues, security", "Priority"], ["Audit Evidence", "Compliance-ready evidence exports", "Designed"]];
export default function ObservabilityPlan(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
   <div><Badge variant="info">Observability</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Monitoring, logging, and production control</h2></div>
   <Button variant="outline">Review</Button>
  </div>
  <div style={{display:"grid",gap:12}}>
   {rows.map(([a,b,c])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 190px 110px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
    <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><Badge variant={c==="Critical"||c==="Blocked"?"danger":c==="Ready"||c==="Designed"||c==="Priority"?"success":"info"}>{c}</Badge>
   </div>)}
  </div>
 </Card>
}
