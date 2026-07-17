import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const maps = [
  ["HubSpot Contact → Dublancer Client", "12 mapped fields", "Active"],
  ["Stripe Invoice → Payment Ledger", "9 mapped fields", "Active"],
  ["GitHub Issue → Workspace Task", "7 mapped fields", "Draft"],
  ["Google Drive File → Knowledge Source", "6 mapped fields", "Active"],
];

export default function DataMappingStudio() {
  return (
    <Card variant="elevated">
      <Badge variant="success">Data Mapping</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 22 }}>Transformation rules</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {maps.map(([name, fields, status]) => (
          <div key={name} style={{ padding: 14, borderRadius: brand.radius.md, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <strong style={{ color: brand.colors.navy }}>{name}</strong>
              <Badge variant={status === "Active" ? "success" : "neutral"}>{status}</Badge>
            </div>
            <p style={{ color: brand.colors.muted, lineHeight: 1.6, margin: "8px 0 0" }}>{fields}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
