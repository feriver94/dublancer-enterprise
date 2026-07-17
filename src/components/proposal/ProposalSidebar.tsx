import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const checklist = [
  ["Executive Summary", "Done"],
  ["Technical Architecture", "Done"],
  ["Milestones", "Done"],
  ["Pricing Strategy", "Done"],
  ["Risk Controls", "Done"],
  ["Acceptance Criteria", "Ready"],
];

export default function ProposalSidebar() {
  return (
    <aside style={{ display: "grid", gap: 24 }}>
      <Card variant="elevated">
        <Badge variant="success">AI Confidence</Badge>
        <div
          style={{
            width: 126,
            height: 126,
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            background:
              "conic-gradient(from 0deg, rgba(0,154,68,.95) 0 94%, rgba(229,231,235,1) 94% 100%)",
            marginTop: 22,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "999px",
              display: "grid",
              placeItems: "center",
              background: brand.colors.white,
              color: brand.colors.green,
              fontSize: "2rem",
              fontWeight: brand.typography.weight.bold,
            }}
          >
            94%
          </div>
        </div>
        <p style={{ color: brand.colors.muted, lineHeight: 1.7 }}>
          Strong opportunity fit based on budget, technology, phased delivery and enterprise SaaS scope.
        </p>
      </Card>

      <Card variant="elevated">
        <Badge variant="info">Proposal Quality</Badge>
        <div style={{ display: "grid", gap: 14, marginTop: 22 }}>
          {checklist.map(([item, status]) => (
            <div
              key={item}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "13px 0",
                borderBottom: `1px solid ${brand.colors.border}`,
                color: brand.colors.text,
              }}
            >
              <span>{item}</span>
              <strong style={{ color: brand.colors.green }}>{status}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card variant="glass">
        <Badge variant="neutral">Action Center</Badge>
        <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
          <Button variant="primary">Submit Proposal</Button>
          <Button variant="outline">Send for Internal Review</Button>
          <Button variant="outline">Create Milestones</Button>
          <Button variant="ghost">Save as Template</Button>
        </div>
      </Card>
    </aside>
  );
}
