import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const checks = [["MFA Enforcement", "Ready"], ["Role-based Access", "Configured"], ["Audit Logging", "Planned"], ["API Keys", "Planned"], ["Data Retention", "Policy Draft"]];

export default function SecurityCenter() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg, rgba(255,255,255,.96), rgba(248,250,252,.82))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="success">Security Center</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Enterprise governance</h2>
        </div>
        <Button variant="outline">Review</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {checks.map(([check, status]) => (
          <div key={check} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}` }}>
            <span style={{ color: brand.colors.text }}>{check}</span>
            <Badge variant={status === "Configured" || status === "Ready" ? "success" : "neutral"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
