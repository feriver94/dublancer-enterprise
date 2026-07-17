import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const risks = [
  ["Scope creep", "Control with milestone boundaries and weekly demos.", "Medium"],
  ["AI reliability", "Add review layer, prompt templates and fallback providers.", "Medium"],
  ["Payment compliance", "Implement escrow-ready workflows after legal review.", "Low"],
];

export default function RiskRegister() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="neutral">Risk Register</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Delivery controls
          </h2>
        </div>
        <Button variant="outline">Review Risks</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {risks.map(([risk, mitigation, level]) => (
          <div
            key={risk}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <strong style={{ color: brand.colors.navy }}>{risk}</strong>
              <Badge variant={level === "Low" ? "success" : "info"}>{level}</Badge>
            </div>
            <p style={{ color: brand.colors.text, lineHeight: 1.7, margin: "10px 0 0" }}>
              {mitigation}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
