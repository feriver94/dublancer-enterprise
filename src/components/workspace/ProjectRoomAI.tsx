import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const suggestions = [
  "Summarize current project health for the client.",
  "Generate next 5 technical tasks for Sprint 3.",
  "Create risk mitigation notes for backend authentication.",
  "Draft a weekly executive update.",
];

export default function ProjectRoomAI() {
  return (
    <Card
      variant="glass"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,.96), rgba(248,250,252,.82))",
      }}
    >
      <Badge variant="success">Project Room AI</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 18,
          marginBottom: 12,
        }}
      >
        Intelligent delivery assistant
      </h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 22 }}>
        Ask AI to summarize, plan, detect risks, generate updates, and prepare delivery documentation.
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

      <Button variant="primary">Run AI Command</Button>
    </Card>
  );
}
