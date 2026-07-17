import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Indexed Documents","12.8M","success"],["Knowledge Entities","84.2M","info"],["Relationships","428M","success"],["Memory Recall","94%","success"],["Retrieval Precision","96%","neutral"],["Governance Score","98%","success"]];
export default function KnowledgePlatformStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
