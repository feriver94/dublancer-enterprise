import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const criteria = [
  "User can browse marketplace projects and view project details.",
  "User can open proposal workspace from a project page.",
  "Proposal draft is editable and structured for client submission.",
  "Milestones, pricing, architecture and risk controls are visible.",
  "UI remains reusable, responsive and aligned with Dublancer design system.",
];

export default function AcceptanceCriteria() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="neutral">Acceptance Criteria</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Delivery quality gates
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        {criteria.map((item) => (
          <div
            key={item}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
              color: brand.colors.text,
              lineHeight: 1.7,
            }}
          >
            ✅ {item}
          </div>
        ))}
      </div>
    </Card>
  );
}
