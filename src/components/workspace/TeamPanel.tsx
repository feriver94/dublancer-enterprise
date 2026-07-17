import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const members = [
  ["Product Lead", "Roadmap and priorities"],
  ["Frontend Engineer", "UI and design system"],
  ["Backend Engineer", "API and database"],
  ["AI Engineer", "Prompt and model workflows"],
  ["QA Lead", "Testing and release quality"],
];

export default function TeamPanel() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="success">Delivery Team</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Assigned roles
          </h2>
        </div>
        <Button variant="ghost">Invite</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {members.map(([role, responsibility]) => (
          <div
            key={role}
            style={{
              display: "grid",
              gridTemplateColumns: "42px 1fr",
              gap: 14,
              alignItems: "center",
              padding: 14,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "999px",
                display: "grid",
                placeItems: "center",
                background: "rgba(0,154,68,.12)",
                color: brand.colors.green,
                fontWeight: brand.typography.weight.bold,
              }}
            >
              {role[0]}
            </div>
            <div>
              <strong style={{ color: brand.colors.navy }}>{role}</strong>
              <p style={{ color: brand.colors.muted, margin: "4px 0 0" }}>{responsibility}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
