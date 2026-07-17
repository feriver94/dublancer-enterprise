import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const logs = [
  "Workflow version v12 published by Organization Admin.",
  "AI decision node executed with policy-approved context.",
  "Owner approved milestone release action.",
  "Retry policy recovered failed webhook delivery.",
  "Workflow run exported for compliance review.",
  "External email action blocked pending human approval.",
];

export default function WorkflowAuditLogs() {
  return (
    <Card variant="elevated">
      <Badge variant="neutral">Audit Logs</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Workflow governance trail</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {logs.map((log) => (
          <div key={log} style={{ padding: "14px 0", borderBottom: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>{log}</div>
        ))}
      </div>
    </Card>
  );
}
