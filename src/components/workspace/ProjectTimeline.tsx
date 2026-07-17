import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const timeline = [
  ["Foundation", "Design system, layout, dashboard, auth UI", "Complete"],
  ["Marketplace", "Project discovery, project details, proposal workspace", "Active"],
  ["Workspace", "Tasks, files, activity, AI execution layer", "Current"],
  ["Identity", "Users, organizations, roles and permissions", "Next"],
];

export default function ProjectTimeline() {
  return (
    <Card variant="elevated" style={{ padding: 32 }}>
      <Badge variant="success">Project Timeline</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Program roadmap
      </h2>

      <div style={{ display: "grid", gap: 14 }}>
        {timeline.map(([phase, detail, status]) => (
          <div
            key={phase}
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr 110px",
              gap: 16,
              alignItems: "center",
              padding: 16,
              borderRadius: brand.radius.lg,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <strong style={{ color: brand.colors.navy }}>{phase}</strong>
            <span style={{ color: brand.colors.text, lineHeight: 1.6 }}>{detail}</span>
            <Badge variant={status === "Complete" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
