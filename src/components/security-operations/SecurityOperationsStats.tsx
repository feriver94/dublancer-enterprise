import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Open Incidents","18","info"],["Critical Alerts","4","neutral"],["Protected Devices","12.8k","success"],["Mean Time to Contain","14m","success"],["Vulnerabilities","84","info"],["Security Score","97%","success"]];
export default function SecurityOperationsStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
