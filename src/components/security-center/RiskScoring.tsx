import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [["Identity Risk","Strong MFA coverage","Low"],["Integration Risk","API key anomaly under review","Medium"],["AI Action Risk","External actions require approval","Medium"],["Payment Risk","Escrow events are policy-guarded","Low"],["Data Exposure Risk","PII masking enabled","Low"]];

export default function RiskScoring() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Risk Scoring</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Enterprise risk model</h2>
        </div>
        <Button variant="outline">Run Model</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {items.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "High" ? "danger" : status === "Review" || status === "Medium" ? "info" : "success"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
