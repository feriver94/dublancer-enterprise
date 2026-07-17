import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Connector Runs","3.2M","success"],["OAuth Installs","8.4k","info"],["Webhook Success","99.7%","success"],["Sync Accuracy","99.4%","success"],["Rate-Limit Recovery","96%","neutral"],["Runtime Health","98%","success"]];
export default function ConnectorRuntimeStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
