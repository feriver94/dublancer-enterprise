import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const compliance=[["GDPR","Privacy controls and data export readiness"],["SOC 2","Audit trails, access control, security policies"],["ISO 27001","Information security management alignment"],["Data Retention","Configurable retention and deletion policies"],["Consent Management","Future-ready user consent workflows"]];
export default function CompliancePanel(){
 return <Card variant="elevated"><Badge variant="info">Compliance</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:22}}>Enterprise compliance posture</h2><div style={{display:"grid",gap:12}}>{compliance.map(([t,d])=><div key={t} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><strong style={{color:brand.colors.navy}}>{t}</strong><p style={{color:brand.colors.muted,lineHeight:1.6,margin:"8px 0 0"}}>{d}</p></div>)}</div></Card>
}
