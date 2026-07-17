import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const members = [
  ["Asif Baloch", "Owner", "Executive"],
  ["Product Lead", "Admin", "Product"],
  ["Engineering Lead", "Admin", "Engineering"],
  ["AI Architect", "Member", "AI"],
  ["QA Lead", "Member", "Quality"],
  ["Security Lead", "Admin", "Security"],
];

export default function TeamDirectory() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Team Directory</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Members and access levels</h2>
        </div>
        <Button variant="primary">Invite Member</Button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {members.map(([name, role, department]) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "46px 1fr 110px 130px", gap: 14, alignItems: "center", padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <div style={{ width: 46, height: 46, borderRadius: "999px", display: "grid", placeItems: "center", background: "rgba(0,154,68,.12)", color: brand.colors.green, fontWeight: brand.typography.weight.bold }}>{name[0]}</div>
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <Badge variant={role === "Owner" ? "success" : "neutral"}>{role}</Badge>
            <span style={{ color: brand.colors.muted }}>{department}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
