import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const decisions = [
  ["Architecture", "Use modular Next.js frontend with reusable component libraries.", "Approved"],
  ["Delivery", "Build marketplace and workspace before backend integrations.", "Approved"],
  ["AI", "Keep UI provider-agnostic for OpenAI, Claude, Gemini and Azure OpenAI.", "Approved"],
  ["Security", "Prepare RBAC and protected routes before payment workflows.", "Pending"],
];

export default function DecisionLog() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="info">Decision Log</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Key project decisions
          </h2>
        </div>
        <Button variant="ghost">Add Decision</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {decisions.map(([type, detail, status]) => (
          <div
            key={detail}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <strong style={{ color: brand.colors.navy }}>{type}</strong>
              <Badge variant={status === "Approved" ? "success" : "neutral"}>{status}</Badge>
            </div>
            <p style={{ color: brand.colors.text, lineHeight: 1.7, margin: "10px 0 0" }}>
              {detail}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
