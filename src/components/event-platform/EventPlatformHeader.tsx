import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function EventPlatformHeader() {
  return (
    <Card variant="glass" style={{ padding: 44, marginBottom: 28 }}>
      <Badge variant="success">Distributed Event Bus & Scheduler Runtime</Badge>
      <h1 style={{ color: brand.colors.navy, fontSize: "clamp(2.8rem,6vw,5.7rem)", fontWeight: brand.typography.weight.bold, lineHeight: 0.95, margin: "22px 0" }}>
        Power Dublancer through one resilient, secure, event-driven backbone.
      </h1>
      <p style={{ color: brand.colors.muted, fontSize: brand.typography.body.lg, lineHeight: 1.8, maxWidth: 940 }}>
        Govern topics, subscriptions, schedules, schemas, retries, replay, dead-letter queues, consumer health, and tenant-safe delivery from one enterprise control plane.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
        <Button variant="primary">Create Topic</Button>
        <Button variant="outline">Publish Event</Button>
        <Button variant="ghost">Replay Stream</Button>
      </div>
    </Card>
  );
}
