import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const settings=[["Branding","Logo, colors, favicon, PDF branding"],["Notifications","Email, workspace, billing, security alerts"],["Integrations","Webhooks, AI providers, CRM, payment providers"],["Domains","Trusted domains and custom workspace URLs"]];
export default function SettingsPanel(){
 return <Card variant="elevated"><div style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:22}}><div><Badge variant="neutral">Settings</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:0}}>Organization configuration</h2></div><Button variant="outline">Save Changes</Button></div><div style={{display:"grid",gap:12}}>{settings.map(([n,d])=><div key={n} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.background,border:`1px solid ${brand.colors.border}`}}><strong style={{color:brand.colors.navy}}>{n}</strong><p style={{color:brand.colors.muted,lineHeight:1.6,margin:"8px 0 0"}}>{d}</p></div>)}</div></Card>
}
