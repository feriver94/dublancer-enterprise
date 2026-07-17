import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const retries = [
  ["evt_88421", "stripe.invoice.updated", "Retrying", "2"],
  ["evt_88422", "hubspot.contact.sync", "Pending", "1"],
  ["evt_88423", "slack.message.post", "Recovered", "3"],
  ["evt_88424", "github.issue.created", "Pending", "1"],
];

export default function RetryQueue() {
  return (
    <Card variant="elevated">
      <Badge variant="neutral">Retry Queue</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Failure recovery queue</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {retries.map(([id, event, status, count]) => (
          <div key={id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px 60px", gap: 12, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{id}</strong>
            <span style={{ color: brand.colors.text }}>{event}</span>
            <Badge variant={status === "Recovered" ? "success" : "info"}>{status}</Badge>
            <span style={{ color: brand.colors.muted }}>{count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
