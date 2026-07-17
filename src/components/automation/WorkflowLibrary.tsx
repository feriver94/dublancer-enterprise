import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const workflows = [
  ["Proposal Approved → Workspace Created", "Marketplace, Workspace, Notifications", "Active"],
  ["Invoice Overdue → CRM Risk Alert", "Payments, CRM, AI", "Active"],
  ["Security Alert → Admin Approval", "Security, Organization, Notifications", "Active"],
  ["Client Renewal Risk → AI Brief", "CRM, Knowledge, Agents", "Active"],
  ["Executive Weekly Memo", "Analytics, Agents, Email", "Draft"],
];

export default function WorkflowLibrary() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Workflow Library</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Enterprise workflow inventory</h2>
        </div>
        <Button variant="outline">Manage Workflows</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {workflows.map(([name, scope, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 220px 90px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{scope}</span>
            <Badge variant={status === "Active" ? "success" : "neutral"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
