import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows=[["Production API Key", "Backend service authentication", "Active"], ["Webhook Signing Secret", "Integration verification", "Active"], ["AI Router Service Account", "Model routing and policy access", "Active"], ["Analytics Export Key", "Read-only reporting access", "Active"], ["Legacy Integration Key", "Rotation required", "Risk"]];
export default function APIKeysServiceAccounts(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
   <div><Badge variant="info">API Keys & Service Accounts</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Machine identity management</h2></div>
   <Button variant="outline">Manage</Button>
  </div>
  <div style={{display:"grid",gap:12}}>
   {rows.map(([a,b,c])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 170px 110px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
    <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><Badge variant={c==="Risk"||c==="Blocked"?"danger":c==="Active"||c==="Healthy"||c==="Enforced"?"success":"info"}>{c}</Badge>
   </div>)}
  </div>
 </Card>
}
