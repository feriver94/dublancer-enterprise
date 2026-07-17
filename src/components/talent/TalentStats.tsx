import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Open Roles","42","success"],["Candidates","3.8k","info"],["Active Freelancers","1.2k","success"],["Interview SLA","92%","neutral"],["Skill Match Avg","88%","success"],["Hiring Pipeline","$2.1M","info"]];
export default function TalentStats(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,variant])=><Card key={l} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{v}</div></Card>)}</section>}
