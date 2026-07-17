import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function AIWidget() {
  return (
    <Card variant="glass">
      <Badge variant="success">AI Copilot</Badge>

      <h3
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 24,
          marginBottom: 12,
        }}
      >
        Project Intelligence Ready
      </h3>

      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 24 }}>
        Use Dublancer AI to analyze requirements, estimate project scope, identify risks,
        recommend skills, and generate proposal strategy.
      </p>

      <Button variant="primary">Run AI Analysis</Button>
    </Card>
  );
}
