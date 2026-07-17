import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const suggestions = [
  "Create a milestone plan for the current marketplace sprint.",
  "Summarize open risks before starting backend authentication.",
  "Generate a client-ready weekly progress update.",
];

export default function AIWorkspacePanel() {
  return (
    <Card
      variant="glass"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,.96), rgba(248,250,252,.82))",
      }}
    >
      <Badge variant="success">Workspace AI</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 12,
        }}
      >
        Execution assistant
      </h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 22 }}>
        AI helps summarize project status, detect risks, generate tasks, and prepare client updates.
      </p>

      <div style={{ display: "grid", gap: 12, marginBottom: 22 }}>
        {suggestions.map((item) => (
          <div
            key={item}
            style={{
              padding: 14,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.white,
              color: brand.colors.text,
              lineHeight: 1.6,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <Button variant="primary">Run Workspace AI</Button>
    </Card>
  );
}
