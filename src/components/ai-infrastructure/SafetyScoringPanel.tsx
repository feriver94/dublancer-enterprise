import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["Prompt injection detection", "Input risk scoring", "Active"], ["PII exposure score", "Sensitive data detection", "Healthy"], ["Financial action risk", "Payment boundaries", "Ready"], ["Admin action risk", "Privileged operations control", "Active"], ["External communication risk", "Human review required", "Ready"]];

export default function SafetyScoringPanel() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Safety Scoring</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>AI risk and policy enforcement</h2>
        </div>
        <Button variant="outline">Manage</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 190px 110px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "Risk" || status === "Blocked" ? "danger" : status === "Active" || status === "Healthy" || status === "Ready" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
