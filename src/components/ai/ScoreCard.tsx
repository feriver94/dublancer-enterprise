import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ScoreCard() {
  const metrics = [
    { label: "Win Score", value: "92%", variant: "success" as const },
    { label: "Budget", value: "$3,200", variant: "info" as const },
    { label: "Timeline", value: "21 Days", variant: "neutral" as const },
    { label: "Complexity", value: "Medium", variant: "success" as const },
  ];

  return (
    <Card
      variant="elevated"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,252,.92))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <Badge variant="info">AI Score</Badge>
          <h2
            style={{
              marginTop: 18,
              marginBottom: 0,
              color: brand.colors.navy,
              fontSize: "2rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.04em",
            }}
          >
            Project Analyzer
          </h2>
        </div>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            background: "rgba(0,154,68,.12)",
            border: "1px solid rgba(0,154,68,.25)",
            color: brand.colors.green,
            fontSize: "1.7rem",
            fontWeight: brand.typography.weight.bold,
          }}
        >
          92%
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {metrics.map((metric) => (
          <div
            key={metric.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 0",
              borderTop: `1px solid ${brand.colors.border}`,
            }}
          >
            <span style={{ color: brand.colors.muted }}>{metric.label}</span>
            <Badge variant={metric.variant}>{metric.value}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
