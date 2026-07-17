import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const escrow = [
  ["AI Marketplace MVP", "$8,000", "Milestone 2", "Ready for Review"],
  ["Enterprise Dashboard", "$4,500", "Milestone 1", "Funded"],
  ["AI Agent Automation", "$6,200", "Milestone 3", "In Progress"],
];

export default function EscrowOverview() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Escrow Overview</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Protected milestone funds
          </h2>
        </div>
        <Button variant="outline">View Escrow Ledger</Button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {escrow.map(([project, amount, milestone, status]) => (
          <div
            key={project}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 140px 150px",
              gap: 16,
              alignItems: "center",
              padding: 18,
              borderRadius: brand.radius.lg,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <strong style={{ color: brand.colors.navy }}>{project}</strong>
            <strong style={{ color: brand.colors.green }}>{amount}</strong>
            <span style={{ color: brand.colors.muted }}>{milestone}</span>
            <Badge variant={status === "Funded" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
