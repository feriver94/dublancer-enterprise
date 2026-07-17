import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const hooks = [
  ["payment.succeeded", "Stripe billing workflow", "Active"],
  ["proposal.approved", "Workspace creation trigger", "Active"],
  ["client.updated", "CRM intelligence refresh", "Active"],
  ["security.alert", "Admin escalation channel", "Active"],
  ["agent.completed", "Automation result processing", "Draft"],
];

export default function WebhookManager() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="neutral">Webhooks</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Webhook routing</h2>
        </div>
        <Button variant="primary">New Webhook</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {hooks.map(([event, target, status]) => (
          <div key={event} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", gap: 12, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{event}</strong>
            <span style={{ color: brand.colors.text }}>{target}</span>
            <Badge variant={status === "Active" ? "success" : "neutral"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
