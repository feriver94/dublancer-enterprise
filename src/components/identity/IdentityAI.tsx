import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights=["Identity Platform must become the first real backend foundation before billing, AI agents, and enterprise tenants go live.","RBAC should be enforced at route, API, database, and AI tool-call levels, not only in the UI.","Service accounts and API keys need rotation, scopes, audit logs, and tenant isolation before partner integrations.","SSO, MFA, and access reviews are the fastest path to enterprise trust for government and large organizations.","Next production step: implement Auth.js or Clerk, Prisma, PostgreSQL, organization schema, session audit, and permission middleware."];
export default function IdentityAI(){
 return <Card variant="glass" style={{background:"linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))"}}>
  <Badge variant="success">Identity AI</Badge><h2 style={{color:brand.colors.navy,fontSize:brand.typography.heading.h3,fontWeight:brand.typography.weight.bold,marginTop:18,marginBottom:12}}>Access intelligence recommendations</h2>
  <p style={{color:brand.colors.muted,lineHeight:1.7,marginBottom:22}}>AI analyzes users, roles, permissions, sessions, service accounts, policies, and audit signals to reduce access risk.</p>
  <div style={{display:"grid",gap:12}}>{insights.map(i=><div key={i} style={{padding:14,borderRadius:brand.radius.md,background:brand.colors.white,border:`1px solid ${brand.colors.border}`,color:brand.colors.text,lineHeight:1.6}}>{i}</div>)}</div>
 </Card>
}
