import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const departments = [
  ["Product", "Roadmap, backlog, feature definition", "8"],
  ["Engineering", "Frontend, backend, architecture, integrations", "24"],
  ["AI", "Prompts, agents, model routing, evaluation", "11"],
  ["Security", "Access, compliance, audit, risk controls", "6"],
  ["Operations", "Client delivery, support, onboarding", "14"],
];

export default function DepartmentMap() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="neutral">Departments</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Organization structure</h2>
        </div>
        <Button variant="outline">Add Department</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {departments.map(([name, scope, count]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", gap: 16, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.text, lineHeight: 1.6 }}>{scope}</span>
            <Badge variant="info">{count} users</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
