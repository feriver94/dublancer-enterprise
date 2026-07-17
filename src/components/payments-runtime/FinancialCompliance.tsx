import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["KYC / KYB", "Identity verification", "Healthy"], ["AML screening", "Transaction checks", "Active"], ["Sanctions screening", "Real-time matching", "Ready"], ["Tax metadata", "Regional requirements", "Healthy"], ["Audit evidence", "Immutable event trail", "Active"]];

export default function FinancialCompliance() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Compliance</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Financial controls and evidence</h2>
        </div>
        <Button variant="outline">Manage</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 210px 110px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "Risk" || status === "Blocked" ? "danger" : status === "Active" || status === "Healthy" || status === "Ready" || status === "Reconciled" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
