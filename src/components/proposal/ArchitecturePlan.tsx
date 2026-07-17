import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const layers = [
  ["Frontend", "Next.js, reusable design system, marketplace, dashboard, proposal workspace"],
  ["Backend", "NestJS API, authentication, users, roles, organizations, project services"],
  ["Data", "PostgreSQL, Redis, audit fields, UUID strategy, soft deletes"],
  ["AI", "Provider-ready AI router for OpenAI, Claude, Gemini, Azure OpenAI and local models"],
  ["DevOps", "Docker, CI/CD, environment management, monitoring and release workflows"],
];

export default function ArchitecturePlan() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="success">Technical Architecture</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Enterprise delivery blueprint
      </h2>

      <div style={{ display: "grid", gap: 14 }}>
        {layers.map(([layer, detail]) => (
          <div
            key={layer}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr",
              gap: 18,
              padding: 18,
              borderRadius: brand.radius.lg,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <strong style={{ color: brand.colors.green }}>{layer}</strong>
            <span style={{ color: brand.colors.text, lineHeight: 1.7 }}>{detail}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
