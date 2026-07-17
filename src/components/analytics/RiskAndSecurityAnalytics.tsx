import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const risks=[["Security Exceptions","3","Low"],["Overdue Access Reviews","4","Medium"],["High AI Spend Teams","2","Review"],["Payment Disputes","1","Low"]];
export default function RiskAndSecurityAnalytics(){
 return <Card variant="elevated"><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="info">Risk & Security</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Governance signals</h2></div><Button variant="outline">Open Security Center</Button></div><div style={{display:"grid",gap:12}}>{risks.map(([r,c,l])=><div key={r} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px",gap:12,alignItems:"center",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><strong style={{color:brand.colors.navy}}>{r}</strong><span style={{color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{c}</span><Badge variant={l==="Medium"||l==="Review"?"info":"success"}>{l}</Badge></div>)}</div></Card>
}
