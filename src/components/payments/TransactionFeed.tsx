import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const transactions = [
  "Milestone 2 funded for AI Marketplace MVP.",
  "Invoice INV-1002 marked as paid.",
  "Payout scheduled for verified freelancer account.",
  "Escrow review requested for Enterprise Dashboard.",
  "Bank transfer method verified for Horizon Digital Group.",
];

export default function TransactionFeed() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Transaction Feed</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>
        Recent financial activity
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        {transactions.map((item) => (
          <div key={item} style={{ padding: "14px 0", borderBottom: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>
            {item}
          </div>
        ))}
      </div>
    </Card>
  );
}
