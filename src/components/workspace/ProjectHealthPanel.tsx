import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ProjectHealthPanel({
  score,
  grade,
  calculatedAt,
}: {
  score?: number;
  grade?: string;
  calculatedAt?: string;
}) {
  if (score === undefined) {
    return <Card variant="soft">Live project health is calculated from the project delivery workspace.</Card>;
  }
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
        marginBottom: 28,
      }}
    >
      <Card variant="elevated">
          <Badge variant={score >= 85 ? "success" : score >= 65 ? "info" : "danger"}>{grade ?? "PROJECT HEALTH"}</Badge>
          <div
            style={{
              marginTop: 18,
              color: brand.colors.navy,
              fontSize: "2rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.04em",
            }}
          >
            {score}%
          </div>
          {calculatedAt ? <p style={{ color: brand.colors.muted, marginTop: 8 }}>{new Date(calculatedAt).toLocaleString()}</p> : null}
        </Card>
    </section>
  );
}
