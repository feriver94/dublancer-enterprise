import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Unified Conversations","428k","success"],["Unread Priority","84","info"],["Meetings This Week","126","success"],["AI Summaries","18.4k","success"],["Response SLA","94%","neutral"],["Sentiment Health","89%","info"]];
export default function CommunicationsStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,x])=><Card key={l} variant="elevated"><Badge variant={x as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold}}>{v}</div></Card>)}</section>}
