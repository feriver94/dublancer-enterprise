import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [
  ["Client onboarding automation", "CRM, Workspace, Notifications"],
  ["Proposal win automation", "Marketplace, Payments, Workspace"],
  ["Invoice risk automation", "Payments, CRM, AI"],
  ["Security escalation automation", "Admin, Security, Notifications"],
  ["Executive reporting automation", "Analytics, Agents, Knowledge"]
];

export default function TemplateGallery() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Templates</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Automation templates</h2>
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
