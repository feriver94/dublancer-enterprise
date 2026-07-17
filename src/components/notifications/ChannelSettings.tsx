import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const channels=[["In-app","Real-time platform alerts","Enabled"],["Email","Executive summaries and approvals","Enabled"],["Slack","Team routing and project alerts","Planned"],["Webhook","External system delivery","Ready"],["SMS","Critical security and payment approvals","Planned"]];
export default function ChannelSettings(){
 return <Card variant="elevated"><Badge variant="neutral">Channels</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Delivery channels</h2><div style={{display:"grid",gap:12}}>{channels.map(([n,d,s])=><div key={n} style={{display:"flex",justifyContent:"space-between",gap:16,padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><div><strong style={{color:brand.colors.navy}}>{n}</strong><p style={{color:brand.colors.muted,margin:"6px 0 0"}}>{d}</p></div><Badge variant={s==="Enabled"||s==="Ready"?"success":"neutral"}>{s}</Badge></div>)}</div></Card>
}
