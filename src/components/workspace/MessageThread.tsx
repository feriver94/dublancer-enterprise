import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const messages = [
  ["Client", "Can we prioritize proposal workflow before payments?"],
  ["Product Lead", "Yes. Proposal workspace is now the active sprint focus."],
  ["AI Assistant", "Recommended next action: define acceptance criteria and backend integration points."],
];

export default function MessageThread() {
  return (
    <Card variant="glass">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="info">Messages</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Project conversation
          </h2>
        </div>
        <Button variant="outline">New Message</Button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {messages.map(([sender, message]) => (
          <div
            key={message}
            style={{
              padding: 16,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.white,
            }}
          >
            <strong style={{ color: brand.colors.green }}>{sender}</strong>
            <p style={{ color: brand.colors.text, lineHeight: 1.7, margin: "8px 0 0" }}>
              {message}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
