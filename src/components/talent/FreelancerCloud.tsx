import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["AI Automation Expert", "Available", "$85/hr", "Top 1%"], ["Full-stack Engineer", "Booked", "$65/hr", "Top 3%"], ["UI/UX Designer", "Available", "$55/hr", "Top 5%"], ["DevOps Consultant", "Available", "$95/hr", "Expert"], ["Security Auditor", "Booked", "$110/hr", "Expert"]];

export default function FreelancerCloud(){
  return <Card variant="elevated" style={{padding:34}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
      <div><Badge variant="success">Freelancer Cloud</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>On-demand expert network</h2></div>
      <Button variant="outline">Find Expert</Button>
    </div>
    <div style={{display:"grid",gap:12}}>
      {rows.map(([a,b,c,d])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 130px 110px 100px",gap:12,alignItems:"center",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
        <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><span style={{color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{c}</span><Badge variant={d==="Excellent"||d==="Final"||d==="Shortlist"||d==="Available"||d==="Critical"?"success":d==="Improve"?"danger":"info"}>{d}</Badge>
      </div>)}
    </div>
  </Card>
}
