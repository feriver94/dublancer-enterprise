import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const payouts = [
  ["Freelancer Balance", "$18,420"],
  ["Available for Payout", "$12,800"],
  ["Pending Clearance", "$5,620"],
  ["Next Payout", "Friday"],
];

export default function PayoutPanel() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg, rgba(255,255,255,.96), rgba(248,250,252,.82))" }}>
      <Badge variant="success">Payouts</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 22,
        }}
      >
        Wallet and payout health
      </h2>

      <div style={{ display: "grid", gap: 14, marginBottom: 24 }}>
        {payouts.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "14px 0",
              borderBottom: `1px solid ${brand.colors.border}`,
            }}
          >
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ color: brand.colors.navy }}>{value}</strong>
          </div>
        ))}
      </div>

      <Button variant="primary">Schedule Payout</Button>
    </Card>
  );
}
