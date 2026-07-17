import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["crm-consumer", "Customer lifecycle updates", "Healthy"], ["analytics-consumer", "Metric aggregation", "Active"], ["notification-consumer", "Email and in-app delivery", "Healthy"], ["workflow-consumer", "Automation triggers", "Active"], ["audit-consumer", "Immutable event capture", "Ready"]];

export default function SubscriptionManager() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Subscriptions</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Consumer groups and delivery policies</h2>
        </div>
        <Button variant="outline">Manage</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 200px 110px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "Blocked" || status === "Risk" ? "danger" : status === "Active" || status === "Healthy" || status === "Ready" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
