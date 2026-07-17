import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [
  ["proposal.approved", "Marketplace proposal approved"],
  ["invoice.overdue", "Invoice passes due date"],
  ["client.health.changed", "CRM health score changes"],
  ["agent.task.completed", "AI agent completes execution"],
  ["security.alert.created", "Security signal is detected"],
  ["workspace.milestone.delayed", "Project milestone slips"]
];

export default function TriggerLibrary() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Trigger Library</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Event-driven triggers</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {items.map(([name, detail]) => (
          <div key={name} style={{ padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <p style={{ color: brand.colors.muted, lineHeight: 1.6, margin: "8px 0 0" }}>{detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
