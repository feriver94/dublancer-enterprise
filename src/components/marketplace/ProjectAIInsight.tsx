import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights = [
  "Strong fit for a senior full-stack team with AI and SaaS marketplace experience.",
  "Best delivery approach is phased: foundation, marketplace core, AI proposal engine, workspace, then payments.",
  "Main risks are scope creep, payment compliance, and AI output reliability. These can be controlled with milestones.",
];

export default function ProjectAIInsight() {
  return (
    <Card
      variant="glass"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.78))",
      }}
    >
      <Badge variant="success">AI Opportunity Intelligence</Badge>

      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 20,
          marginBottom: 18,
        }}
      >
        Why this project is valuable
      </h2>

      <div style={{ display: "grid", gap: 14, marginBottom: 24 }}>
        {insights.map((insight) => (
          <div
            key={insight}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.white,
              color: brand.colors.text,
              lineHeight: 1.7,
            }}
          >
            {insight}
          </div>
        ))}
      </div>

      <Button variant="primary">Generate Winning Proposal</Button>
    </Card>
  );
}
