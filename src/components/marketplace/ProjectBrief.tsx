import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const sections = [
  {
    title: "Project Objective",
    body:
      "The client wants to launch a scalable AI work platform that combines marketplace discovery, AI proposal tools, workspace collaboration, secure contracts, and payment workflows.",
  },
  {
    title: "Core Scope",
    body:
      "Authentication, project posting, freelancer profiles, AI project analyzer, proposal generator, client dashboard, admin workflows, notifications, and payment-ready architecture.",
  },
  {
    title: "Expected Outcome",
    body:
      "A polished MVP that can be demonstrated to investors, enterprise clients, and early adopters with a clear path toward backend, AI, and payment integration.",
  },
];

export default function ProjectBrief() {
  return (
    <Card variant="elevated" style={{ padding: 32 }}>
      <Badge variant="info">Project Brief</Badge>
      <h2
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h2,
          fontWeight: brand.typography.weight.bold,
          letterSpacing: "-0.05em",
          marginTop: 18,
          marginBottom: 24,
        }}
      >
        Client requirement summary
      </h2>

      <div style={{ display: "grid", gap: 18 }}>
        {sections.map((item) => (
          <div
            key={item.title}
            style={{
              padding: 22,
              borderRadius: brand.radius.lg,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <h3
              style={{
                color: brand.colors.navy,
                fontWeight: brand.typography.weight.bold,
                fontSize: "1.2rem",
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
