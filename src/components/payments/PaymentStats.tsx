import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  ["Total Volume", "$248.6k", "success"],
  ["In Escrow", "$64.2k", "info"],
  ["Pending Invoices", "18", "neutral"],
  ["Payout Health", "98%", "success"],
];

export default function PaymentStats() {
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
              fontSize: "2.35rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.045em",
            }}
          >
            {value}
          </div>
        </Card>
      ))}
    </section>
  );
}
