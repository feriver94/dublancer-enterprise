import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const keys = [
  ["Production API Key", "Last used 3m ago", "Protected"],
  ["Analytics Read Key", "Last used today", "Active"],
  ["Webhook Signing Key", "Rotated 7d ago", "Secure"],
  ["AI Router Key", "Last used 12m ago", "Protected"],
];

export default function ApiKeysPanel() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="info">API Keys</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Developer access controls</h2>
        </div>
        <Button variant="outline">Create Key</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {keys.map(([name, last, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px", gap: 12, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{last}</span>
            <Badge variant="success">{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
