import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rules=[["Critical security events","Notify Owner + Security Lead","Active"],["Payment approvals above $5k","Notify Finance + Owner","Active"],["AI spend anomaly","Notify Admins","Active"],["Client renewal risk","Notify Account Owner","Active"],["Workspace milestone delay","Notify Project Manager","Draft"]];
export default function NotificationRules(){
 return <Card variant="elevated"><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="info">Automation Rules</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Intelligent routing</h2></div><Button variant="outline">New Rule</Button></div><div style={{display:"grid",gap:12}}>{rules.map(([trigger,action,status])=><div key={trigger} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><div style={{display:"flex",justifyContent:"space-between",gap:14}}><strong style={{color:brand.colors.navy}}>{trigger}</strong><Badge variant={status==="Active"?"success":"neutral"}>{status}</Badge></div><p style={{color:brand.colors.muted,lineHeight:1.6,margin:"8px 0 0"}}>{action}</p></div>)}</div></Card>
}
