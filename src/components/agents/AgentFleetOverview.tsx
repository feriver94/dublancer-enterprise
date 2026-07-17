import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats=[["Active Agents","42","success"],["Live Tasks","184","info"],["Success Rate","98.7%","success"],["Avg Reasoning Time","2.1s","neutral"],["Monthly Runs","92.4k","info"],["Cost Optimized","31%","success"]];export default function AgentFleetOverview(){return <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:20,marginBottom:28}}>{stats.map(([l,v,variant])=><Card key={l} variant="elevated"><Badge variant={variant as "success"|"info"|"neutral"}>{l}</Badge><div style={{marginTop:18,color:brand.colors.navy,fontSize:"2.25rem",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.045em"}}>{v}</div></Card>)}</section>}
