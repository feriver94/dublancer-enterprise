import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [["Suspicious login pattern","Blocked","High"],["API key anomaly","Investigating","Medium"],["Webhook replay attempt","Blocked","High"],["Unusual AI tool request","Quarantined","Medium"],["Failed MFA spike","Monitoring","Low"]];

export default function ThreatMonitor() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Threat Monitor</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Real-time threat signals</h2>
        </div>
        <Button variant="outline">Open SIEM</Button>
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
