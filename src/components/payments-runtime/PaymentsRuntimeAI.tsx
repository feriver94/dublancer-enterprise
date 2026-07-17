import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights = [
  "Escrow funds must remain segregated from operating balances in both ledger design and real bank accounts.",
  "Every payment, release, refund, payout, and dispute requires double-entry ledger records and immutable audit lineage.",
  "Provider failover must preserve idempotency so retries never create duplicate charges or payouts.",
  "High-risk escrow releases and payout destination changes should require step-up authentication and dual approval.",
  "Production launch requires regulated payment providers, legal review, KYC/KYB, AML, sanctions screening, tax, and jurisdiction-specific compliance.",
];

export default function PaymentsRuntimeAI() {
  return (
    <Card variant="glass">
      <Badge variant="success">Payments Runtime AI</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18 }}>Financial operations recommendations</h2>
      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {insights.map((insight) => (
          <div key={insight} style={{ padding: 14, border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md }}>{insight}</div>
        ))}
      </div>
    </Card>
  );
}
