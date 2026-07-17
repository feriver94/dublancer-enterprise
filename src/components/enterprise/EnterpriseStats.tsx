import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Organizations", "14", "success"],
  ["Active Members", "286", "info"],
  ["Departments", "32", "neutral"],
  ["Security Score", "96%", "success"],
];

export default function EnterpriseStats() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginBottom: 28 }}>
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div style={{ marginTop: 18, color: brand.colors.navy, fontSize: "2.35rem", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.045em" }}>
            {value}
          </div>
        </Card>
      ))}
    </section>
  );
}
