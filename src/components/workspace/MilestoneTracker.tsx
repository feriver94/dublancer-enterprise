import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const milestones = [
  ["01", "Platform Foundation", "Design system, layout, auth UI, dashboard", "Complete", "100%"],
  ["02", "Marketplace Core", "Search, categories, project details, proposal room", "Active", "74%"],
  ["03", "Workspace Core", "Project room, tasks, files, risks and updates", "Active", "62%"],
  ["04", "Identity Backend", "Users, sessions, roles, organizations", "Next", "0%"],
];

export default function MilestoneTracker() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Milestones</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Delivery tracker
          </h2>
        </div>
        <Button variant="outline">Manage Milestones</Button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {milestones.map(([number, title, detail, status, progress]) => (
          <div
            key={title}
            style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr 110px 70px",
              gap: 16,
              alignItems: "center",
              padding: 18,
              borderRadius: brand.radius.lg,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <Badge variant="neutral">{number}</Badge>
            <div>
              <strong style={{ color: brand.colors.navy }}>{title}</strong>
              <p style={{ color: brand.colors.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
                {detail}
              </p>
            </div>
            <Badge variant={status === "Complete" ? "success" : "info"}>{status}</Badge>
            <strong style={{ color: brand.colors.green }}>{progress}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
