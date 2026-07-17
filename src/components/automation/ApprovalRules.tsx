import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rules = [
  ["Financial actions above $5k", "Owner approval required"],
  ["Security policy changes", "Security admin approval required"],
  ["External email delivery", "Account owner approval required"],
  ["AI-generated client decisions", "Human approval required"],
  ["Admin API key changes", "Owner and audit log required"],
];

export default function ApprovalRules() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <Badge variant="success">Human Approval Rules</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Governance guardrails</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {rules.map(([rule, detail]) => (
          <div key={rule} style={{ padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{rule}</strong>
            <p style={{ color: brand.colors.muted, lineHeight: 1.6, margin: "8px 0 0" }}>{detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
