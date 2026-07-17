import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows=[["Marketplace Fees","$188k","39%"],["Enterprise Plans","$142k","29%"],["AI Copilot Usage","$94k","19%"],["Payments & Escrow","$62k","13%"]];
export default function RevenueIntelligence(){
 return <Card variant="elevated" style={{padding:34}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}><div><Badge variant="success">Revenue Intelligence</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Commercial performance by engine</h2></div><Button variant="outline">Forecast Revenue</Button></div>
  <div style={{display:"grid",gap:14}}>{rows.map(([s,v,p])=><div key={s} style={{padding:18,borderRadius:brand.radius.lg,border:`1px solid ${brand.colors.border}`,background:brand.colors.background}}><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:10}}><strong style={{color:brand.colors.navy}}>{s}</strong><strong style={{color:brand.colors.green}}>{v}</strong></div><div style={{height:10,borderRadius:999,background:"rgba(15,76,92,.08)",overflow:"hidden"}}><div style={{width:p,height:"100%",borderRadius:999,background:brand.colors.green}} /></div><div style={{marginTop:8,color:brand.colors.muted}}>{p} of revenue mix</div></div>)}</div>
 </Card>
}
