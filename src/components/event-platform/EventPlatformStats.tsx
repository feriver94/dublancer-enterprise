import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Events Today", "28.4M", "success"],
  ["Active Topics", "146", "info"],
  ["Consumers", "384", "success"],
  ["Delivery Success", "99.98%", "success"],
  ["Scheduled Jobs", "428", "neutral"],
  ["DLQ Backlog", "18", "info"],
];

export default function EventPlatformStats() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 20, marginBottom: 28 }}>
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div style={{ marginTop: 18, color: brand.colors.navy, fontSize: "2.25rem", fontWeight: brand.typography.weight.bold }}>{value}</div>
        </Card>
      ))}
    </section>
  );
}
