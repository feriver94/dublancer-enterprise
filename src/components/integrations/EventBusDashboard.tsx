import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const streams = [
  ["crm.client.updated", "842k events", "Healthy"],
  ["workspace.project.changed", "728k events", "Healthy"],
  ["payments.invoice.updated", "428k events", "Healthy"],
  ["agents.task.completed", "384k events", "Healthy"],
  ["security.audit.created", "182k events", "Monitoring"],
];

export default function EventBusDashboard() {
  return (
    <Card variant="glass" style={{ padding: 34, background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <Badge variant="success">Event Bus</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Real-time event streams</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {streams.map(([stream, count, status]) => (
          <div key={stream} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px", gap: 12, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{stream}</strong>
            <span style={{ color: brand.colors.green, fontWeight: brand.typography.weight.bold }}>{count}</span>
            <Badge variant={status === "Healthy" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
