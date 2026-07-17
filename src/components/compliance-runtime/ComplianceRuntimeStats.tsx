import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Controls Monitored","428","success"],["Policies Evaluated","18.4M","info"],["Evidence Items","2.8M","success"],["Open Exceptions","24","neutral"],["Automated Coverage","92%","success"],["Compliance Health","97%","success"]];
export default function ComplianceRuntimeStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
