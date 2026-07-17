import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const usage=[["Proposal Generation","8.2k runs","44%"],["Project Analysis","4.6k runs","25%"],["CRM Intelligence","3.1k runs","17%"],["Workspace Summaries","2.5k runs","14%"]];
export default function AIUsageAnalytics(){
 return <Card variant="glass" style={{background:"linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))"}}><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="success">AI Usage Analytics</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>AI-native operating layer</h2></div><Button variant="outline">Optimize Spend</Button></div><div style={{display:"grid",gap:12}}>{usage.map(([w,r,s])=><div key={w} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.white,border:`1px solid ${brand.colors.border}`}}><div style={{display:"flex",justifyContent:"space-between",gap:16}}><strong style={{color:brand.colors.navy}}>{w}</strong><span style={{color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{r}</span></div><p style={{color:brand.colors.muted,margin:"8px 0 0"}}>{s} of total AI activity</p></div>)}</div></Card>
}
