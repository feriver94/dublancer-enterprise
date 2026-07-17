import { Badge, Button, Card } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ProjectRoomHeader() {
  return (
    <Card
      variant="glass"
      style={{
        padding: 40,
        marginBottom: 28,
        background:
          "radial-gradient(circle at 12% 18%, rgba(0,154,68,.16), transparent 32%), radial-gradient(circle at 90% 10%, rgba(15,76,92,.12), transparent 30%), linear-gradient(135deg, #ffffff, #f8fafc)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 28,
          alignItems: "center",
        }}
      >
        <div>
          <Badge variant="success">Project Room</Badge>
          <h1
            style={{
              color: brand.colors.navy,
              fontSize: "clamp(2.7rem, 6vw, 5.4rem)",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.07em",
              lineHeight: 0.92,
              marginTop: 22,
              marginBottom: 22,
              maxWidth: 960,
            }}
          >
            AI Marketplace MVP Delivery Command Center.
          </h1>
          <p
            style={{
              color: brand.colors.muted,
              fontSize: brand.typography.body.lg,
              lineHeight: 1.85,
              maxWidth: 820,
            }}
          >
            A dedicated execution room for milestones, tasks, files, risks, decisions, messages, and AI-assisted delivery actions.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Button variant="primary">Create Update</Button>
          <Button variant="outline">Add Milestone</Button>
          <Button variant="ghost">Share Room</Button>
        </div>
      </div>
    </Card>
  );
}
