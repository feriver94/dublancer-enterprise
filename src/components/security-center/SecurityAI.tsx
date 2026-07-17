import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights = [
  "Integration risk increased slightly due to API key anomaly investigation.",
  "MFA coverage is strong but guest access review should run this week.",
  "AI tool boundaries are correctly blocking high-risk admin actions.",
  "Webhook replay protection prevented a high-severity integration incident.",
];

export default function SecurityAI() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <Badge variant="success">Security AI</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 12 }}>AI security analyst</h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 22 }}>AI reviews signals, incidents, audit logs, identity posture, and integration security.</p>
      <div style={{ display: "grid", gap: 12 }}>
        {insights.map((item) => (
          <div key={item} style={{ padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>{item}</div>
        ))}
      </div>
    </Card>
  );
}
