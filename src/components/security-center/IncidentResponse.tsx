import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [["INC-2081 API key anomaly","Investigating","Medium"],["INC-2080 Webhook replay attempt","Contained","High"],["INC-2079 Suspicious login pattern","Resolved","High"],["INC-2078 AI tool boundary violation","Contained","Medium"]];

export default function IncidentResponse() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Incident Response</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Response queue</h2>
        </div>
        <Button variant="outline">Create Playbook</Button>
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
