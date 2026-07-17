import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const health=[["Strategic Clients","84"],["Renewal Risk","7 accounts"],["Upsell Opportunities","$318k"],["Outstanding Invoices","$64.2k"],["Client Health Avg","89%"]];
export default function CRMHealthAnalytics(){return <Card variant="elevated"><Badge variant="success">CRM Health</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Relationship intelligence</h2><div style={{display:"grid",gap:12}}>{health.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${brand.colors.border}`}}><span style={{color:brand.colors.muted}}>{l}</span><strong style={{color:brand.colors.navy}}>{v}</strong></div>)}</div></Card>}
