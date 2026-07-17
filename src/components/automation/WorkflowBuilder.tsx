import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const nodes = [
  ["Trigger", "proposal.approved", "Starts when a client approves a proposal"],
  ["AI Decision", "risk.score > medium", "AI evaluates scope, budget, and client risk"],
  ["Approval", "Owner review", "Human-in-the-loop approval before workspace creation"],
  ["Action", "Create workspace", "Creates project room, milestones, and team tasks"],
  ["Notify", "Send alerts", "Notifies CRM owner, finance, and delivery team"],
];

export default function WorkflowBuilder() {
  return (
    <Card variant="glass" style={{ padding: 34, background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Visual Builder</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>
            Proposal-to-workspace automation
          </h2>
        </div>
        <Button variant="primary">Publish Workflow</Button>
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {nodes.map(([type, name, detail], index) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "56px 130px 1fr", gap: 16, alignItems: "center", padding: 18, borderRadius: brand.radius.lg, background: brand.colors.white, border: `1px solid ${brand.colors.border}` }}>
            <Badge variant="neutral">{String(index + 1).padStart(2, "0")}</Badge>
            <strong style={{ color: brand.colors.green }}>{type}</strong>
            <div>
              <strong style={{ color: brand.colors.navy }}>{name}</strong>
              <p style={{ color: brand.colors.muted, lineHeight: 1.6, margin: "6px 0 0" }}>{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
