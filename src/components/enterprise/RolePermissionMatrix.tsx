import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const roles = [
  ["Owner", "Full platform control, billing, security, organization settings"],
  ["Admin", "Manage users, projects, workspace, AI tools, reports"],
  ["Manager", "Manage teams, projects, milestones, proposals"],
  ["Member", "Access assigned projects, files, tasks, messages"],
  ["Viewer", "Read-only access to approved areas"],
];

export default function RolePermissionMatrix() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="success">RBAC</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 24 }}>Roles and permission model</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {roles.map(([role, scope]) => (
          <div key={role} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 18, padding: 18, borderRadius: brand.radius.lg, border: `1px solid ${brand.colors.border}`, background: brand.colors.background }}>
            <Badge variant={role === "Owner" ? "success" : "info"}>{role}</Badge>
            <span style={{ color: brand.colors.text, lineHeight: 1.7 }}>{scope}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
