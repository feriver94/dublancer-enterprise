import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const delivery=[["On-time Milestones","91%"],["At-risk Projects","18"],["Avg Delivery Cycle","22 days"],["Client Approval Rate","88%"],["Workspace Activity","High"]];
export default function WorkspaceDeliveryAnalytics(){return <Card variant="elevated"><Badge variant="neutral">Workspace Delivery</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Execution health</h2><div style={{display:"grid",gap:12}}>{delivery.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><span style={{color:brand.colors.text}}>{l}</span><strong style={{color:brand.colors.navy}}>{v}</strong></div>)}</div></Card>}
