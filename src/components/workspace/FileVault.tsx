import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const files = [
  ["Proposal Draft", "DOCX", "Updated today"],
  ["Architecture Notes", "MD", "Updated yesterday"],
  ["Milestone Plan", "PDF", "2 days ago"],
  ["Client Brief", "TXT", "3 days ago"],
];

export default function FileVault() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="neutral">File Vault</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Project documents
          </h2>
        </div>
        <Button variant="outline">Upload</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {files.map(([name, type, date]) => (
          <div
            key={name}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 120px",
              gap: 14,
              padding: 14,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
              alignItems: "center",
            }}
          >
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <Badge variant="info">{type}</Badge>
            <span style={{ color: brand.colors.muted }}>{date}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
