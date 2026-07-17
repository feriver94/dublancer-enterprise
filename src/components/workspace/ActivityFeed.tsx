import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const activity = [
  "AI generated a proposal workspace draft.",
  "Marketplace project details page moved to review.",
  "Navbar spacing issue resolved and pushed.",
  "Dashboard preview page created successfully.",
  "Design tokens updated for typography weights.",
];

export default function ActivityFeed() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Activity Feed</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 22,
        }}
      >
        Latest project updates
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        {activity.map((item) => (
          <div
            key={item}
            style={{
              padding: "14px 0",
              borderBottom: `1px solid ${brand.colors.border}`,
              color: brand.colors.text,
              lineHeight: 1.6,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </Card>
  );
}
