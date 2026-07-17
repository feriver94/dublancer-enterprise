import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows=[["Dublancer Enterprise", "Primary production tenant", "Active"], ["UrbanTech UAE", "Government pilot tenant", "Active"], ["Horizon Digital", "Enterprise client tenant", "Active"], ["Apex AI Labs", "AI partner tenant", "Active"], ["Nexa Cloud", "Risk recovery tenant", "Review"]];
export default function OrganizationDirectory(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
   <div><Badge variant="info">Organizations</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Multi-tenant organization control</h2></div>
   <Button variant="outline">Manage</Button>
  </div>
  <div style={{display:"grid",gap:12}}>
   {rows.map(([a,b,c])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 170px 110px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
    <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><Badge variant={c==="Risk"||c==="Blocked"?"danger":c==="Active"||c==="Healthy"||c==="Enforced"?"success":"info"}>{c}</Badge>
   </div>)}
  </div>
 </Card>
}
