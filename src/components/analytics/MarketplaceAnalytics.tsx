import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const metrics=[["Open Projects","12,480"],["Avg Project Value","$4,280"],["Proposal Conversion","31.4%"],["AI Match Accuracy","92%"],["High-value Leads","1,862"]];
export default function MarketplaceAnalytics(){
 return <Card variant="elevated"><Badge variant="info">Marketplace Analytics</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Demand and opportunity quality</h2><div style={{display:"grid",gap:12}}>{metrics.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${brand.colors.border}`}}><span style={{color:brand.colors.muted}}>{l}</span><strong style={{color:brand.colors.navy}}>{v}</strong></div>)}</div></Card>
}
