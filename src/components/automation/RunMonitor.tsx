import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const runs = [
  ["run_9021", "Proposal Approved → Workspace Created", "Completed", "1.8s"],
  ["run_9022", "Invoice Overdue → CRM Risk Alert", "Completed", "2.1s"],
  ["run_9023", "Security Alert → Admin Approval", "Waiting", "Approval"],
  ["run_9024", "Client Renewal Risk → AI Brief", "Completed", "4.2s"],
  ["run_9025", "Executive Weekly Memo", "Failed", "Retrying"],
];

export default function RunMonitor() {
  return (
    <Card variant="elevated">
      <Badge variant="info">Run Monitor</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Live workflow execution</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {runs.map(([id, name, status, time]) => (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 90px", gap: 12, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{id}</strong>
            <span style={{ color: brand.colors.text }}>{name}</span>
            <Badge variant={status === "Completed" ? "success" : status === "Failed" ? "danger" : "info"}>{status}</Badge>
            <span style={{ color: brand.colors.muted }}>{time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
