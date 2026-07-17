import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights=["Enterprise plans and AI usage are the fastest-growing revenue engines this month.","Workspace delivery health is strong, but backend capacity should increase before real-time collaboration begins.","CRM upsell opportunities exceed current outstanding invoice risk by 4.9x.","Security posture is strong; prioritize SSO and access review automation next."];
export default function ExecutiveAI(){
 return <Card variant="glass" style={{background:"linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))"}}><Badge variant="success">Executive AI</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:12}}>Board-level intelligence</h2><p style={{color:brand.colors.muted,lineHeight:1.7,marginBottom:22}}>AI summarizes strategic opportunities, risks, revenue movement, operational bottlenecks, and next executive actions.</p><div style={{display:"grid",gap:12,marginBottom:22}}>{insights.map(i=><div key={i} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.white,border:`1px solid ${brand.colors.border}`,color:brand.colors.text,lineHeight:1.6}}>{i}</div>)}</div><Button variant="primary">Generate Executive Memo</Button></Card>
}
