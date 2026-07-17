import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["Engineering Team", "Q3 Review", "92%", "Excellent"], ["Sales Team", "Q3 Review", "86%", "Healthy"], ["Design Team", "Q3 Review", "89%", "Healthy"], ["Security Team", "Q3 Review", "95%", "Excellent"], ["Support Team", "Q3 Review", "82%", "Improve"]];

export default function PerformanceReviews(){
  return <Card variant="elevated" style={{padding:34}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:24}}>
      <div><Badge variant="neutral">Performance</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Performance review system</h2></div>
      <Button variant="outline">Start Review</Button>
    </div>
    <div style={{display:"grid",gap:12}}>
      {rows.map(([a,b,c,d])=><div key={a} style={{display:"grid",gridTemplateColumns:"1fr 130px 110px 100px",gap:12,alignItems:"center",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}>
        <strong style={{color:brand.colors.navy}}>{a}</strong><span style={{color:brand.colors.muted}}>{b}</span><span style={{color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{c}</span><Badge variant={d==="Excellent"||d==="Final"||d==="Shortlist"||d==="Available"||d==="Critical"?"success":d==="Improve"?"danger":"info"}>{d}</Badge>
      </div>)}
    </div>
  </Card>
}
