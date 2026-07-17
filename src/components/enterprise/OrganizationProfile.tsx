import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function OrganizationProfile() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="success">Organization</Badge>
          <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>Dublancer Global</h2>
        </div>
        <Button variant="outline">Edit Profile</Button>
      </div>
      <p style={{ color: brand.colors.muted, lineHeight: 1.8, marginBottom: 24 }}>
        Enterprise workspace for managing AI-powered freelance operations, project delivery, talent workflows, organizations, departments, roles, and secure collaboration.
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        {[["Organization Type", "Enterprise SaaS"], ["Region", "UAE / Global"], ["Primary Domain", "dublancer.com"], ["Plan", "Enterprise"], ["Status", "Active"]].map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${brand.colors.border}` }}>
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ color: brand.colors.navy }}>{value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
