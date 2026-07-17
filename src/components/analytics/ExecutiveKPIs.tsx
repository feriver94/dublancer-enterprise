import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const kpis=[["Platform GMV","$2.84M","+18.6%","success"],["Net Revenue","$486k","+12.4%","success"],["AI Assisted Work","74%","+9.1%","info"],["Active Organizations","1,284","+22%","success"],["Workspace Health","96%","+4%","neutral"],["Security Score","97%","Stable","success"]];
export default function ExecutiveKPIs(){
 return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:20,marginBottom:28}}>
  {kpis.map(([l,v,c,variant])=><Card key={l} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.2rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{v}</div><div style={{marginTop:8,color:brand.colors.green,fontWeight:brand.typography.weight.bold}}>{c}</div></Card>)}
 </section>
}
