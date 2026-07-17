import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const activities = [
  "AI analyzed a new project brief",
  "New proposal draft generated",
  "Workspace task marked as complete",
  "Client review added to project timeline",
];

export default function ActivityCard() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h3
          style={{
            color: brand.colors.navy,
            fontSize: brand.typography.heading.h3,
            fontWeight: brand.typography.weight.bold,
            margin: 0,
          }}
        >
          Recent Activity
        </h3>
        <Badge variant="neutral">Live</Badge>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {activities.map((activity) => (
          <div
            key={activity}
            style={{
              padding: "14px 0",
              borderBottom: `1px solid ${brand.colors.border}`,
              color: brand.colors.text,
            }}
          >
            {activity}
          </div>
        ))}
      </div>
    </Card>
  );
}
