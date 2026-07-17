import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const approvals=[["Milestone Release","AI Marketplace MVP","$8,000","High"],["New API Key","Analytics Integration","Security","Medium"],["Role Change","Finance Lead","RBAC","Medium"],["Invoice Export","Q2 Enterprise Billing","Finance","Low"]];
export default function ApprovalQueue(){
 return <Card variant="elevated" style={{padding:34}}><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="neutral">Approval Queue</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Governance approvals</h2></div><Button variant="primary">Review All</Button></div><div style={{display:"grid",gap:12}}>{approvals.map(([t,s,a,r])=><div key={`${t}-${s}`} style={{display:"grid",gridTemplateColumns:"150px 1fr 120px 100px",gap:14,alignItems:"center",padding:16,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><Badge variant="info">{t}</Badge><strong style={{color:brand.colors.navy}}>{s}</strong><span style={{color:brand.colors.muted}}>{a}</span><Badge variant={r==="High"?"danger":r==="Medium"?"info":"success"}>{r}</Badge></div>)}</div></Card>
}
