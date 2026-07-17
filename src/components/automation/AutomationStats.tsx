import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Active Workflows", "128", "success"],
  ["Runs Today", "42.8k", "info"],
  ["Success Rate", "99.1%", "success"],
  ["Approval SLA", "94%", "neutral"],
  ["Avg Run Time", "2.4s", "info"],
  ["Events Automated", "8.4M", "success"],
];

export default function AutomationStats() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 20, marginBottom: 28 }}>
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div style={{ marginTop: 18, color: brand.colors.navy, fontSize: "2.25rem", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.045em" }}>
            {value}
          </div>
        </Card>
      ))}
    </section>
  );
}
