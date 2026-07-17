import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Available Connectors","184","success"],["Active Connections","8.4k","info"],["Sync Jobs Today","3.2M","success"],["Webhook Success","99.4%","success"],["Credential Health","96%","neutral"],["Marketplace Score","98%","success"]];
export default function IntegrationsStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
