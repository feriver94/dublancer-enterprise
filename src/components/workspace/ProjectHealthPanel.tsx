import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const health = [
  ["Delivery Health", "92%", "success"],
  ["Budget Status", "On Track", "info"],
  ["Timeline Risk", "Low", "success"],
  ["Client Sentiment", "Positive", "success"],
];

export default function ProjectHealthPanel() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
        marginBottom: 28,
      }}
    >
      {health.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info"}>{label}</Badge>
          <div
            style={{
              marginTop: 18,
              color: brand.colors.navy,
              fontSize: "2rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.04em",
            }}
          >
            {value}
          </div>
        </Card>
      ))}
    </section>
  );
}
