import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ClientProfile() {
  return (
    <Card variant="elevated">
      <Badge variant="success">Verified Client</Badge>

      <h2
        style={{
          marginTop: 20,
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
        }}
      >
        Horizon Digital Group
      </h2>

      <p style={{ color: brand.colors.muted, lineHeight: 1.7 }}>
        Enterprise software buyer seeking a long-term product engineering partner for phased SaaS delivery.
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
        {[
          ["Client Rating", "4.9/5"],
          ["Projects Posted", "38"],
          ["Payment Status", "Verified"],
          ["Location", "UAE / Global"],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ color: brand.colors.navy }}>{value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
