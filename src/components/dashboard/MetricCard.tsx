import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

type MetricCardProps = {
  title: string;
  value: string;
  change?: string;
  variant?: "success" | "danger" | "info" | "neutral";
};

export default function MetricCard({
  title,
  value,
  change,
  variant = "info",
}: MetricCardProps) {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <p
            style={{
              color: brand.colors.muted,
              fontSize: brand.typography.body.sm,
              marginBottom: 10,
            }}
          >
            {title}
          </p>
          <h3
            style={{
              color: brand.colors.navy,
              fontSize: "2rem",
              fontWeight: brand.typography.weight.bold,
              margin: 0,
            }}
          >
            {value}
          </h3>
        </div>
        {change ? <Badge variant={variant}>{change}</Badge> : null}
      </div>
    </Card>
  );
}
