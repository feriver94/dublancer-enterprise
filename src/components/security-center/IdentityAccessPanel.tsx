import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [["Single Sign-On","Ready","Healthy"],["Multi-Factor Authentication","Enforced","Healthy"],["Role-Based Access Control","Active","Healthy"],["Session Management","Configured","Healthy"],["Device Trust","Monitoring","Review"],["Access Reviews","Scheduled","Healthy"]];

export default function IdentityAccessPanel() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Identity & Access</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Zero-trust identity layer</h2>
        </div>
        <Button variant="outline">Review Access</Button>
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
