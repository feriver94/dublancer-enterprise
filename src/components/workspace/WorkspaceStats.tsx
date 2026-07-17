import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Active Projects", "12", "success"],
  ["Open Tasks", "38", "info"],
  ["Files Shared", "124", "neutral"],
  ["AI Insights", "27", "success"],
];

export default function WorkspaceStats() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
        marginBottom: 28,
      }}
    >
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div
            style={{
              marginTop: 18,
              color: brand.colors.navy,
              fontSize: "2.4rem",
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
