import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Members","286","success"],["Active Teams","32","info"],["AI Usage","18.4k","success"],["Security Score","97%","neutral"],["Monthly Spend","$42.8k","info"],["Audit Events","9.6k","success"]];
export default function OrganizationStats(){
 return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>
  {stats.map(([label,value,variant])=><Card key={label} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{label}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{value}</div></Card>)}
 </section>;
}
