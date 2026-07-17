import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Connected Apps", "38", "success"],
  ["Events Today", "2.8M", "info"],
  ["Webhook Success", "99.4%", "success"],
  ["Retry Queue", "126", "neutral"],
  ["Avg Latency", "142ms", "info"],
  ["Secrets Health", "100%", "success"],
];

export default function IntegrationStats() {
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
