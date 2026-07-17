import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows=[["Owner", "Full organization administration", "Enforced"], ["Admin", "Manage users, billing, workflows", "Enforced"], ["Manager", "Projects, CRM, analytics access", "Enforced"], ["Finance", "Invoices, payouts, revenue views", "Enforced"], ["Viewer", "Read-only workspace access", "Enforced"]];
export default function RolePermissionMatrix(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
   <div><Badge variant="info">Roles & Permissions</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Fine-grained RBAC matrix</h2></div>
   <Button variant="outline">Manage</Button>
  </div>
  <div style={{display:"grid",gap:12}}>
   {rows.map(([a,b,c])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 170px 110px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
    <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><Badge variant={c==="Risk"||c==="Blocked"?"danger":c==="Active"||c==="Healthy"||c==="Enforced"?"success":"info"}>{c}</Badge>
   </div>)}
  </div>
 </Card>
}
