import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const invoices = [
  ["INV-1001", "Horizon Digital Group", "$12,000", "Due in 7 days", "Pending"],
  ["INV-1002", "Nexa Cloud Systems", "$6,400", "Paid yesterday", "Paid"],
  ["INV-1003", "Apex AI Labs", "$9,800", "Due today", "Action Needed"],
  ["INV-1004", "UrbanTech UAE", "$3,200", "Draft", "Draft"],
];

export default function InvoiceTable() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Invoices</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Billing pipeline
          </h2>
        </div>
        <Button variant="primary">New Invoice</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {invoices.map(([id, client, amount, due, status]) => (
          <div
            key={id}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr 110px 140px 130px",
              gap: 14,
              alignItems: "center",
              padding: 16,
              borderRadius: brand.radius.md,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <strong style={{ color: brand.colors.navy }}>{id}</strong>
            <span style={{ color: brand.colors.text }}>{client}</span>
            <strong style={{ color: brand.colors.green }}>{amount}</strong>
            <span style={{ color: brand.colors.muted }}>{due}</span>
            <Badge variant={status === "Paid" ? "success" : status === "Action Needed" ? "danger" : "neutral"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
