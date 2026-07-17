import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const checks = [
  ["KYC / KYB", "Required for payouts"],
  ["Tax Documents", "Region-based collection"],
  ["Audit Trail", "Every transaction logged"],
  ["Dispute Handling", "Milestone evidence workflow"],
];

export default function CompliancePanel() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="success">Compliance</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>
            Commercial governance
          </h2>
        </div>
        <Button variant="ghost">Review</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {checks.map(([label, detail]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{label}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
