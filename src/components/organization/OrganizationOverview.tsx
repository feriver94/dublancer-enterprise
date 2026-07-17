import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function OrganizationOverview(){
 const rows=[["Tenant ID","org_dublancer_global_001"],["Plan","Enterprise"],["Primary Region","UAE / Global"],["Data Policy","Enterprise Retention"],["AI Governance","Provider-ready"],["Operational Status","Healthy"]];
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="success">Enterprise Tenant</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Dublancer Global Organization</h2></div><Button variant="outline">Configure Tenant</Button></div>
  <p style={{color:brand.colors.muted,lineHeight:1.8,marginBottom:24}}>Central command for identity, access control, teams, departments, AI governance, payments policy, compliance, security, branding, API keys, and audit visibility.</p>
  <div style={{display:"grid",gap:14}}>{rows.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${brand.colors.border}`}}><span style={{color:brand.colors.muted}}>{l}</span><strong style={{color:brand.colors.navy}}>{v}</strong></div>)}</div>
 </Card>
}
