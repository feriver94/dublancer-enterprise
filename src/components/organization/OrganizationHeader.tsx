import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function OrganizationHeader() {
  return (
    <Card variant="glass" style={{padding:44,marginBottom:28,background:"radial-gradient(circle at 12% 18%, rgba(0,154,68,.16), transparent 34%), radial-gradient(circle at 92% 8%, rgba(15,76,92,.16), transparent 32%), linear-gradient(135deg,#fff,#f8fafc)"}}>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:28,alignItems:"center"}}>
        <div>
          <Badge variant="success">Organization Command Center</Badge>
          <h1 style={{color:brand.colors.navy,fontSize:"clamp(2.8rem,6vw,5.7rem)",fontWeight:brand.typography.weight.bold,letterSpacing:"-0.075em",lineHeight:.92,marginTop:22,marginBottom:22,maxWidth:1000}}>
            Govern users, roles, security, AI usage, compliance, and enterprise operations.
          </h1>
          <p style={{color:brand.colors.muted,fontSize:brand.typography.body.lg,lineHeight:1.85,maxWidth:900}}>
            A multi-tenant governance layer for teams, agencies, enterprises, and future government-grade work platforms.
          </p>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
          <Button variant="primary">Invite Member</Button><Button variant="outline">Review Security</Button><Button variant="ghost">Export Audit</Button>
        </div>
      </div>
    </Card>
  );
}
