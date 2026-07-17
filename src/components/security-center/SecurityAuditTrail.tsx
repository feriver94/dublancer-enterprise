import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const logs = [
  "Owner exported SOC audit evidence package.",
  "Security Agent blocked suspicious API key request.",
  "MFA enforcement policy updated for all admins.",
  "Webhook replay attempt contained and logged.",
  "AI tool execution blocked by policy boundary.",
  "Access review generated for Finance role.",
];

export default function SecurityAuditTrail() {
  return (
    <Card variant="elevated">
      <Badge variant="neutral">Security Audit Trail</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Immutable security events</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {logs.map((log) => (
          <div key={log} style={{ padding: "14px 0", borderBottom: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>{log}</div>
        ))}
      </div>
    </Card>
  );
}
