import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Organizations","1.8k","success"],["Users","84.2k","info"],["MFA Coverage","96%","success"],["SSO Tenants","428","success"],["Active Sessions","18.4k","neutral"],["Policy Score","98%","success"]];
export default function IdentityStats(){
 return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>
  {stats.map(([label,value,variant])=><Card key={label} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{label}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{value}</div></Card>)}
 </section>
}
