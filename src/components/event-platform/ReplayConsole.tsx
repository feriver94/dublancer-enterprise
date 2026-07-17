import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const rows = [["Replay by time range", "Bounded recovery", "Ready"], ["Replay by tenant", "Tenant-scoped repair", "Healthy"], ["Replay failed consumer", "Targeted redelivery", "Active"], ["Dry-run replay", "No-side-effect validation", "Ready"], ["Replay audit log", "Operator reason captured", "Healthy"]];

export default function ReplayConsole() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Replay & Recovery</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Safe historical event replay</h2>
        </div>
        <Button variant="outline">Manage</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(([name, detail, status]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 200px 110px", gap: 14, alignItems: "center", padding: 16, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <span style={{ color: brand.colors.muted }}>{detail}</span>
            <Badge variant={status === "Blocked" || status === "Risk" ? "danger" : status === "Active" || status === "Healthy" || status === "Ready" ? "success" : "info"}>{status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
