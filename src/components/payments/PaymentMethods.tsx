import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const methods = [
  ["Stripe", "Card payments and subscriptions", "Ready"],
  ["PayPal", "Global freelancer payouts", "Planned"],
  ["Bank Transfer", "Enterprise invoices", "Ready"],
  ["Escrow Wallet", "Milestone fund protection", "Design"],
];

export default function PaymentMethods() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="neutral">Payment Methods</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>
            Provider readiness
          </h2>
        </div>
        <Button variant="outline">Configure</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {methods.map(([name, description, status]) => (
          <div
            key={name}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <strong style={{ color: brand.colors.navy }}>{name}</strong>
              <Badge variant={status === "Ready" ? "success" : "info"}>{status}</Badge>
            </div>
            <p style={{ color: brand.colors.muted, lineHeight: 1.7, margin: "8px 0 0" }}>{description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
