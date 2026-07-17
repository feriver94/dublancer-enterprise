import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const controls=[["Multi-Factor Authentication","Enforced"],["Single Sign-On","Ready"],["Session Management","Configured"],["Trusted Domains","Configured"],["IP Restrictions","Planned"],["Password Policy","Strong"],["Threat Monitoring","Active"]];
export default function SecurityCenter(){
 return <Card variant="glass" style={{background:"linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))"}}><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="success">Security Center</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Zero-trust readiness</h2></div><Button variant="outline">Run Review</Button></div><div style={{display:"grid",gap:12}}>{controls.map(([c,s])=><div key={c} style={{display:"flex",justifyContent:"space-between",gap:16,padding:14,borderRadius:brand.radius.md,background:brand.colors.white,border:`1px solid ${brand.colors.border}`}}><span style={{color:brand.colors.text}}>{c}</span><Badge variant={s==="Planned"?"neutral":"success"}>{s}</Badge></div>)}</div></Card>
}
