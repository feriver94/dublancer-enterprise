import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ProposalPreview() {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Proposal Preview</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: "1.8rem",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.04em",
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Client-ready proposal draft
          </h2>
        </div>
        <Button variant="outline">Copy Draft</Button>
      </div>

      <div
        style={{
          padding: 24,
          borderRadius: brand.radius.lg,
          border: `1px solid ${brand.colors.border}`,
          background: brand.colors.background,
          color: brand.colors.text,
          lineHeight: 1.8,
        }}
      >
        <p>
          Hello, I reviewed your project requirements and the scope points to a scalable AI-powered
          platform that should be delivered in structured phases rather than as one large build.
        </p>
        <p>
          I recommend starting with the foundation: authentication, user roles, project posting,
          proposal workflows, AI analysis, and a reusable workspace. This gives you a demoable MVP
          quickly while keeping the architecture ready for payments, contracts, analytics, and
          enterprise features.
        </p>
        <p>
          My suggested delivery approach is a phased roadmap with clear milestones, technical
          documentation, and production-ready architecture from the beginning.
        </p>
      </div>
    </Card>
  );
}
