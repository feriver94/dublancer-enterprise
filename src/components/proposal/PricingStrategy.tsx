import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [
  ["Recommended Bid", "$8,000-$14,000"],
  ["Commercial Model", "Milestone-based delivery"],
  ["Risk Buffer", "15% scope reserve"],
  ["Payment Structure", "Deposit + milestone releases"],
  ["Support Option", "Monthly maintenance retainer"],
];

export default function PricingStrategy() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="info">Commercial Strategy</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Pricing plan built for conversion
      </h2>

      <div style={{ display: "grid", gap: 14 }}>
        {items.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 24,
              padding: "16px 0",
              borderBottom: `1px solid ${brand.colors.border}`,
            }}
          >
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ color: brand.colors.navy }}>{value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
