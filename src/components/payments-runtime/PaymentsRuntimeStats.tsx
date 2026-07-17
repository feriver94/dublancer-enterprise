import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Processed Today", "$1.84M", "success"],
  ["Escrow Balance", "$8.42M", "info"],
  ["Payout Success", "99.4%", "success"],
  ["Open Disputes", "18", "neutral"],
  ["Reconciled", "99.98%", "success"],
  ["Risk Score", "Low", "success"],
];

export default function PaymentsRuntimeStats() {
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
