import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const events=["User invited to Engineering department.","AI generated executive analytics memo.","Proposal workspace updated by Product Lead.","Payment milestone moved to Ready for Review.","CRM client health score recalculated.","API key rotated for internal workspace integration.","Security audit export generated."];
export default function ActivityTimeline(){
 return <Card variant="elevated"><Badge variant="success">Activity Timeline</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Enterprise event stream</h2><div style={{display:"grid",gap:12}}>{events.map(e=><div key={e} style={{padding:"14px 0",borderBottom:`1px solid ${brand.colors.border}`,color:brand.colors.text,lineHeight:1.6}}>{e}</div>)}</div></Card>
}
