import { Card, Button, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const actions = [
  "Create Project",
  "Generate Proposal",
  "Invite Team",
  "Open Workspace",
];

export default function QuickActions() {
  return (
    <Card variant="elevated">
      <div style={{ marginBottom: 24 }}>
        <Badge variant="info">Quick Actions</Badge>
        <h3
          style={{
            color: brand.colors.navy,
            fontSize: brand.typography.heading.h3,
            fontWeight: brand.typography.weight.bold,
            marginTop: 18,
            marginBottom: 0,
          }}
        >
          Move work forward
        </h3>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {actions.map((action, index) => (
          <Button key={action} variant={index === 0 ? "primary" : "outline"}>
            {action}
          </Button>
        ))}
      </div>
    </Card>
  );
}
