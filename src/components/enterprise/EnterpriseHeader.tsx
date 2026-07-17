import { Badge, Button, Card } from "@/components/ui";
import { brand } from "@/constants/design";

export default function EnterpriseHeader() {
  return (
    <Card variant="glass" style={{ padding: 42, marginBottom: 28, background: "radial-gradient(circle at 12% 18%, rgba(0,154,68,.16), transparent 34%), radial-gradient(circle at 90% 8%, rgba(15,76,92,.14), transparent 32%), linear-gradient(135deg, #ffffff, #f8fafc)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 28, alignItems: "center" }}>
        <div>
          <Badge variant="success">Enterprise Control Center</Badge>
          <h1 style={{ color: brand.colors.navy, fontSize: "clamp(2.8rem, 6vw, 5.6rem)", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.075em", lineHeight: 0.92, marginTop: 22, marginBottom: 22, maxWidth: 960 }}>
            Manage organizations, teams, roles, security, and delivery governance.
          </h1>
          <p style={{ color: brand.colors.muted, fontSize: brand.typography.body.lg, lineHeight: 1.85, maxWidth: 860 }}>
            Dublancer Enterprise provides a multi-tenant operating layer for companies, agencies, teams, and future government-ready workflows.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Button variant="primary">Create Organization</Button>
          <Button variant="outline">Invite Users</Button>
          <Button variant="ghost">Security Review</Button>
        </div>
      </div>
    </Card>
  );
}
