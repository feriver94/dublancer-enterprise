import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Trust Evaluations","18.4M","success"],["Managed Secrets","8.2k","info"],["Protected APIs","428","success"],["Blocked Requests","84k","success"],["Keys Rotated","1.8k","neutral"],["Zero-Trust Score","98%","success"]];
export default function SecurityRuntimeStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
