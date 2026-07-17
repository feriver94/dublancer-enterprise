import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights = [
  "Version event contracts before production services begin publishing.",
  "Make every consumer idempotent because at-least-once delivery can produce duplicates.",
  "Require tenantId, correlationId, causationId, schemaVersion, and traceId on every event.",
  "Dead-letter events need ownership, replay controls, and immutable operator reasons.",
  "Persist schedules and leases so restarts never lose delayed jobs.",
];

export default function EventPlatformArchitect() {
  return (
    <Card variant="glass">
      <Badge variant="success">Event Platform Architect</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18 }}>
        Production event architecture recommendations
      </h2>
      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {insights.map((insight) => (
          <div key={insight} style={{ padding: 14, borderRadius: brand.radius.md, border: `1px solid ${brand.colors.border}`, color: brand.colors.text }}>
            {insight}
          </div>
        ))}
      </div>
    </Card>
  );
}
