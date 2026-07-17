import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const logs=["Owner updated organization security policy.","Admin invited a new AI architect.","Finance role exported billing report.","API key created for internal workspace integration.","SSO configuration marked ready for provider connection.","Audit export generated for compliance review."];
export default function AuditLogs(){
 return <Card variant="elevated"><Badge variant="info">Audit Logs</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Immutable governance trail</h2><div style={{display:"grid",gap:12}}>{logs.map(i=><div key={i} style={{padding:"14px 0",borderBottom:`1px solid ${brand.colors.border}`,color:brand.colors.text,lineHeight:1.6}}>{i}</div>)}</div></Card>
}
