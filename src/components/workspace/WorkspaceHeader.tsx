import { Badge, Button, Card } from "@/components/ui";
import { brand } from "@/constants/design";

export default function WorkspaceHeader() {
  return (
    <Card
      variant="glass"
      style={{
        padding: 38,
        marginBottom: 28,
        background:
          "radial-gradient(circle at 10% 15%, rgba(0,154,68,.14), transparent 34%), radial-gradient(circle at 90% 10%, rgba(15,76,92,.12), transparent 30%), linear-gradient(135deg, #ffffff, #f8fafc)",
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
          <Badge variant="success">Dublancer Workspace</Badge>
          <h1
            style={{
              color: brand.colors.navy,
              fontSize: "clamp(2.7rem, 6vw, 5.4rem)",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.07em",
              lineHeight: 0.92,
              marginTop: 22,
              marginBottom: 22,
              maxWidth: 920,
            }}
          >
            Where projects, teams, files, and AI execution come together.
          </h1>
          <p
            style={{
              color: brand.colors.muted,
              fontSize: brand.typography.body.lg,
              lineHeight: 1.85,
              maxWidth: 820,
            }}
          >
            Manage project delivery, milestones, tasks, files, messages, and AI recommendations in one enterprise-grade workspace.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Button variant="primary">Create Task</Button>
          <Button variant="outline">Upload File</Button>
          <Button variant="ghost">Invite Team</Button>
        </div>
      </div>
    </Card>
  );
}
