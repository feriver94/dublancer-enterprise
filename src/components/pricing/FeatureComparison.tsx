import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [
  ["AI proposal generation", "Limited", "Unlimited", "Custom"],
  ["Workspace project rooms", "1", "Unlimited", "Unlimited"],
  ["Marketplace intelligence", "Basic", "Advanced", "Enterprise"],
  ["Organization roles", "No", "Team roles", "RBAC"],
  ["Payments and billing", "No", "Included", "Advanced"],
  ["Audit logs", "No", "Basic", "Full"],
  ["Support", "Community", "Priority", "Dedicated"],
];

export default function FeatureComparison() {
  return (
    <Card variant="elevated" style={{ padding: 34, marginBottom: 28 }}>
      <Badge variant="info">Plan Comparison</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 24 }}>
        Compare platform capabilities
      </h2>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([feature, starter, business, enterprise]) => (
          <div key={feature} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 140px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{feature}</strong>
            <span style={{ color: brand.colors.muted }}>{starter}</span>
            <span style={{ color: brand.colors.green, fontWeight: brand.typography.weight.bold }}>{business}</span>
            <span style={{ color: brand.colors.navy, fontWeight: brand.typography.weight.bold }}>{enterprise}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
