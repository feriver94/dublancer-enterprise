import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const analysis = [
  {
    title: "Scope Classification",
    value: "Enterprise SaaS Platform",
    description: "Marketplace, AI Copilot, Workspace, Payments, Analytics, and Admin workflows.",
  },
  {
    title: "Risk Level",
    value: "Controlled",
    description: "Clear modular architecture reduces delivery risk and supports phased execution.",
  },
  {
    title: "Recommended Delivery",
    value: "Phased MVP",
    description: "Start with Identity, Marketplace core, AI proposal engine, and workspace foundation.",
  },
];

export default function AnalysisCard() {
  return (
    <Card variant="elevated">
      <div style={{ marginBottom: 26 }}>
        <Badge variant="success">Strategic Analysis</Badge>
        <h2
          style={{
            color: brand.colors.navy,
            fontSize: "1.8rem",
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.04em",
            marginTop: 18,
            marginBottom: 0,
          }}
        >
          AI Delivery Intelligence
        </h2>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {analysis.map((item) => (
          <div
            key={item.title}
            style={{
              padding: 20,
              borderRadius: brand.radius.lg,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <div style={{ color: brand.colors.muted, marginBottom: 8 }}>{item.title}</div>
            <div
              style={{
                color: brand.colors.navy,
                fontWeight: brand.typography.weight.bold,
                fontSize: "1.15rem",
                marginBottom: 8,
              }}
            >
              {item.value}
            </div>
            <p style={{ color: brand.colors.text, lineHeight: 1.7, margin: 0 }}>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
