import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const checks = [
  ["OAuth token refresh", "Healthy"],
  ["Secret rotation policy", "Healthy"],
  ["Webhook signatures", "Verified"],
  ["Rate limit protection", "Active"],
  ["Circuit breakers", "Configured"],
  ["Audit coverage", "100%"],
];

export default function IntegrationHealth() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <Badge variant="success">Integration Health</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Security and reliability posture</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {checks.map(([check, status]) => (
          <div key={check} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}` }}>
            <span style={{ color: brand.colors.text }}>{check}</span>
            <Badge variant="success">{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
