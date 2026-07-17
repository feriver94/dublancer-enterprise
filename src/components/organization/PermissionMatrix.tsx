import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows=[["Marketplace","View","Create","Manage","Export"],["Workspace","View","Create","Manage","Audit"],["CRM","View","Create","Manage","Export"],["Payments","View","Invoice","Approve","Export"],["AI Usage","Use","Configure","Approve","Audit"],["Admin","View","Invite","Configure","Full"]];
export default function PermissionMatrix(){
 return <Card variant="elevated" style={{padding:34}}><Badge variant="info">Permission Matrix</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:24}}>Governance-ready controls</h2><div style={{display:"grid",gap:12}}>{rows.map(([a,p1,p2,p3,p4])=><div key={a} style={{display:"grid",gridTemplateColumns:"150px repeat(4,1fr)",gap:12,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><strong style={{color:brand.colors.navy}}>{a}</strong>{[p1,p2,p3,p4].map(i=><Badge key={i} variant="neutral">{i}</Badge>)}</div>)}</div></Card>
}
