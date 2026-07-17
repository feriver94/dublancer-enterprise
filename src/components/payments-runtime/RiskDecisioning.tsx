import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["Velocity checks", "Transaction frequency", "Active"], ["Device risk", "Identity correlation", "Healthy"], ["Beneficiary risk", "Destination verification", "Ready"], ["Escrow release anomaly", "Milestone correlation", "Active"], ["High-risk jurisdiction", "Enhanced due diligence", "Review"]];

export default function RiskDecisioning() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Risk Decisioning</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Fraud, anomaly, and policy controls</h2>
        </div>
        <Button variant="outline">Manage</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 210px 110px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "Risk" || status === "Blocked" ? "danger" : status === "Active" || status === "Healthy" || status === "Ready" || status === "Reconciled" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
