import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  { value: "12.4k+", label: "Verified Projects" },
  { value: "8.9k+", label: "AI-Matched Experts" },
  { value: "$42M+", label: "Projected Work Value" },
  { value: "92%", label: "AI Match Accuracy" },
];

export default function MarketplaceStats() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
      }}
    >
      {stats.map((stat) => (
        <Card key={stat.label} variant="elevated">
          <Badge variant="info">{stat.label}</Badge>
          <div
            style={{
              marginTop: 18,
              color: brand.colors.navy,
              fontSize: "2.2rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.04em",
            }}
          >
            {stat.value}
          </div>
        </Card>
      ))}
    </section>
  );
}
