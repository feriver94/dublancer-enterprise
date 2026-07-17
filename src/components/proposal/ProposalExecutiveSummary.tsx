import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const items = [
  {
    title: "Client Goal",
    body:
      "Launch a premium AI-powered freelance marketplace that combines project discovery, proposal intelligence, workspace collaboration, contracts, payments, and enterprise controls.",
  },
  {
    title: "Recommended Strategy",
    body:
      "Deliver the platform through phased milestones: foundation, marketplace core, proposal workspace, identity platform, AI services, payments, analytics, and production hardening.",
  },
  {
    title: "Business Outcome",
    body:
      "A demoable SaaS MVP ready for stakeholder review, investor conversations, enterprise pilots, and future API/database/AI integrations.",
  },
];

export default function ProposalExecutiveSummary() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="success">Executive Summary</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h2,
          fontWeight: brand.typography.weight.bold,
          letterSpacing: "-0.055em",
          marginTop: 18,
          marginBottom: 28,
        }}
      >
        Strategic proposal overview
      </h2>

      <div style={{ display: "grid", gap: 18 }}>
        {items.map((item) => (
          <div
            key={item.title}
            style={{
              padding: 22,
              borderRadius: brand.radius.lg,
              border: `1px solid ${brand.colors.border}`,
              background: brand.colors.background,
            }}
          >
            <h3
              style={{
                color: brand.colors.navy,
                fontSize: "1.2rem",
                fontWeight: brand.typography.weight.bold,
                marginBottom: 10,
              }}
            >
              {item.title}
            </h3>
            <p style={{ color: brand.colors.text, lineHeight: 1.8, margin: 0 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
