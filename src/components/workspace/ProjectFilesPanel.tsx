import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const files = [
  ["Project Brief", "TXT", "Client input"],
  ["Proposal Draft", "DOCX", "AI generated"],
  ["Milestone Plan", "PDF", "Delivery plan"],
  ["Architecture Notes", "MD", "Technical"],
];

export default function ProjectFilesPanel() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="neutral">Files</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Delivery assets
          </h2>
        </div>
        <Button variant="outline">Upload</Button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {files.map(([name, type, context]) => (
          <div
            key={name}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 120px",
              gap: 14,
              alignItems: "center",
              padding: 14,
              borderRadius: brand.radius.md,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <strong style={{ color: brand.colors.navy }}>{name}</strong>
            <Badge variant="info">{type}</Badge>
            <span style={{ color: brand.colors.muted }}>{context}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
