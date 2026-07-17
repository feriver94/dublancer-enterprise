import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const logs = [
  "Owner updated organization profile.",
  "Admin invited a new engineering member.",
  "Security role reviewed access policies.",
  "AI workspace settings prepared for provider integration.",
  "Marketplace project room created for AI MVP delivery.",
];

export default function AuditLog() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Audit Log</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Recent enterprise activity</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {logs.map((item) => (
          <div key={item} style={{ padding: "14px 0", borderBottom: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>{item}</div>
        ))}
      </div>
    </Card>
  );
}
