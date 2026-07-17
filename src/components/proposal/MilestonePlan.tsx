import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const milestones = [
  ["01", "Foundation", "Design system, layout, dashboard, auth UI and routing", "Complete"],
  ["02", "Marketplace", "Project discovery, project details and proposal workspace", "In Progress"],
  ["03", "Identity", "Auth, users, roles, organizations and protected routes", "Next"],
  ["04", "AI Platform", "AI router, prompts, proposal generation and provider integrations", "Planned"],
  ["05", "Payments", "Contracts, escrow-ready structure, invoices and wallet flows", "Planned"],
];

export default function MilestonePlan() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="success">Milestone Plan</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Phased roadmap with demoable outcomes
      </h2>

      <div style={{ display: "grid", gap: 14 }}>
        {milestones.map(([number, phase, scope, status]) => (
          <div
            key={phase}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 150px 1fr 120px",
              gap: 16,
              alignItems: "center",
              padding: 18,
              borderRadius: brand.radius.lg,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <Badge variant="neutral">{number}</Badge>
            <strong style={{ color: brand.colors.navy }}>{phase}</strong>
            <span style={{ color: brand.colors.text, lineHeight: 1.6 }}>{scope}</span>
            <Badge variant={status === "Complete" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
