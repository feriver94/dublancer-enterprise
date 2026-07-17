import { Card, Button, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ApplyPanel() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Proposal Workspace</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 20,
          marginBottom: 12,
        }}
      >
        Ready to apply?
      </h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 24 }}>
        Use Dublancer AI to create a tailored proposal, pricing strategy, milestone plan, and technical roadmap.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <Button variant="primary">Start Proposal</Button>
        <Button variant="outline">Ask AI for Strategy</Button>
        <Button variant="ghost">Save for Later</Button>
      </div>
    </Card>
  );
}
