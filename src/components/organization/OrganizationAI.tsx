import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights=["Engineering capacity may become constrained if backend starts before RBAC scope is frozen.","AI usage is rising fastest in proposal and CRM workflows.","Finance should review pending invoice permissions before payment automation.","Security posture is strong, but SSO provider connection should be prioritized."];
export default function OrganizationAI(){
 return <Card variant="glass" style={{background:"linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))"}}><Badge variant="success">Organization AI</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:12}}>Executive intelligence</h2><p style={{color:brand.colors.muted,lineHeight:1.7,marginBottom:22}}>AI summarizes organizational risks, usage patterns, security posture, and operational opportunities.</p><div style={{display:"grid",gap:12,marginBottom:22}}>{insights.map(i=><div key={i} style={{padding:14,borderRadius:brand.radius.md,border:`1px solid ${brand.colors.border}`,background:brand.colors.white,color:brand.colors.text,lineHeight:1.6}}>{i}</div>)}</div><Button variant="primary">Generate Executive Brief</Button></Card>
}
