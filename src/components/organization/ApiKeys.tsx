import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const keys=[["Production API","Last used 2h ago","Active"],["AI Router Key","Last used today","Active"],["Webhook Signing Key","Rotated 7d ago","Secure"]];
export default function ApiKeys(){
 return <Card variant="elevated"><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="neutral">API Management</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Keys and integrations</h2></div><Button variant="outline">Create Key</Button></div><div style={{display:"grid",gap:12}}>{keys.map(([n,u,s])=><div key={n} style={{display:"grid",gridTemplateColumns:"1fr 140px 90px",gap:14,alignItems:"center",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><strong style={{color:brand.colors.navy}}>{n}</strong><span style={{color:brand.colors.muted}}>{u}</span><Badge variant="success">{s}</Badge></div>)}</div></Card>
}
