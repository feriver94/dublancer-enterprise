import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function PaymentsRuntimeHeader() {
  return (
    <Card variant="glass" style={{ padding: 44, marginBottom: 28 }}>
      <Badge variant="success">Enterprise Payments & Escrow Runtime</Badge>
      <h1 style={{ color: brand.colors.navy, fontSize: "clamp(2.8rem,6vw,5.7rem)", fontWeight: brand.typography.weight.bold, lineHeight: 0.94, margin: "22px 0" }}>
        Orchestrate secure payments, escrow, milestone releases, payouts, and financial risk.
      </h1>
      <p style={{ color: brand.colors.muted, fontSize: brand.typography.body.lg, lineHeight: 1.8, maxWidth: 940 }}>
        A finance-grade control plane for payment intents, escrow balances, milestone approvals, payouts, reconciliation, fraud controls, ledger integrity, disputes, and compliance evidence.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <Button variant="primary">Create Payment</Button>
        <Button variant="outline">Fund Escrow</Button>
        <Button variant="ghost">Run Reconciliation</Button>
      </div>
    </Card>
  );
}
