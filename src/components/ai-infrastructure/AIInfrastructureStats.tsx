import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Model Routes", "18", "success"],
  ["RAG Accuracy", "94%", "success"],
  ["Vector Objects", "12.8M", "info"],
  ["Memory Recall", "91%", "success"],
  ["Eval Runs", "48.2k", "neutral"],
  ["Cost Optimized", "31%", "success"],
];

export default function AIInfrastructureStats() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 20, marginBottom: 28 }}>
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div style={{ marginTop: 18, color: brand.colors.navy, fontSize: "2.25rem", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.045em" }}>{value}</div>
        </Card>
      ))}
    </section>
  );
}
