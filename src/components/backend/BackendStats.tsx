import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Core Services","18","success"],["Database Models","64","info"],["API Domains","22","success"],["Worker Queues","12","neutral"],["Event Streams","38","info"],["Readiness Score","41%","success"]];
export default function BackendStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,variant])=><Card key={l} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{v}</div></Card>)}</section>}
