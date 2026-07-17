import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [
  ["Create workspace", "Create project room, tasks, and milestones"],
  ["Send notification", "Route alert to users, teams, or channels"],
  ["Run AI agent", "Call approved agent with governed context"],
  ["Update CRM", "Write notes, health scores, and next actions"],
  ["Create invoice", "Generate billing record or payment request"],
  ["Write audit log", "Record immutable governance event"]
];

export default function ActionLibrary() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Action Library</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Secure automation actions</h2>
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
