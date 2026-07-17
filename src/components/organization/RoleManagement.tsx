import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const roles=[["Owner","Full platform, billing, security, API, and organization control"],["Admin","Manage users, teams, projects, CRM, workspace, and payments"],["Manager","Manage assigned departments, projects, milestones, and reports"],["Finance","Manage billing, invoices, payouts, exports, and payment reviews"],["Member","Access assigned projects, files, AI tools, and workspace rooms"],["Guest","Limited access to shared client/project areas"]];
export default function RoleManagement(){
 return <Card variant="elevated" style={{padding:34}}><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="success">RBAC</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Roles and access model</h2></div><Button variant="outline">Create Role</Button></div><div style={{display:"grid",gap:14}}>{roles.map(([r,s])=><div key={r} style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:18,padding:18,borderRadius:brand.radius.lg,border:`1px solid ${brand.colors.border}`,background:brand.colors.background}}><Badge variant={r==="Owner"?"success":"info"}>{r}</Badge><span style={{color:brand.colors.text,lineHeight:1.7}}>{s}</span></div>)}</div></Card>
}
