import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Messages Today","3.8M","success"],["Delivery Success","99.6%","success"],["Active Templates","428","info"],["Opt-in Coverage","93%","success"],["Retry Recovery","97%","neutral"],["Compliance Score","98%","success"]];
export default function MessagingRuntimeStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
