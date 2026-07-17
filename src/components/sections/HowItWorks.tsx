import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const steps = [
  {
    title: "Post or analyze work",
    description:
      "Clients can create projects while Dublancer AI analyzes scope, budget, skills, risk, and delivery path.",
  },
  {
    title: "Match with verified talent",
    description:
      "The platform recommends suitable freelancers, teams, and specialists using structured project intelligence.",
  },
  {
    title: "Work inside one workspace",
    description:
      "Contracts, milestones, files, messages, tasks, notes, and delivery updates stay connected in one place.",
  },
];

export default function HowItWorks() {
  return (
    <section style={{ padding: "72px 0" }}>
      <div style={{ marginBottom: 40 }}>
        <Badge variant="success">How It Works</Badge>
        <h2
          style={{
            marginTop: 18,
            fontSize: brand.typography.heading.h2,
            color: brand.colors.navy,
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.04em",
          }}
        >
          From opportunity to delivery
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
        }}
      >
        {steps.map((step, index) => (
          <Card key={step.title} variant="elevated">
            <Badge variant="neutral">Step {index + 1}</Badge>
            <h3
              style={{
                marginTop: 24,
                marginBottom: 12,
                fontSize: brand.typography.heading.h3,
                color: brand.colors.navy,
                fontWeight: brand.typography.weight.bold,
              }}
            >
              {step.title}
            </h3>
            <p
              style={{
                color: brand.colors.muted,
                lineHeight: 1.7,
                fontSize: brand.typography.body.md,
              }}
            >
              {step.description}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
