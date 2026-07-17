import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const faqs = [
  {
    question: "Is Dublancer only a freelance marketplace?",
    answer:
      "No. Dublancer is positioned as an AI Work Platform. The marketplace is one module, while AI Copilot, workspace, contracts, payments, teams, and analytics create the complete operating system.",
  },
  {
    question: "Who is Dublancer built for?",
    answer:
      "It is designed for businesses, verified freelancers, agencies, enterprise teams, and future government-ready workflows.",
  },
  {
    question: "Why build reusable sections now?",
    answer:
      "Reusable sections keep every future page consistent, faster to build, easier to maintain, and aligned with the design system.",
  },
  {
    question: "What comes after Sprint 0.5?",
    answer:
      "After the platform foundation is complete, Sprint 1 will begin with the Identity Platform, including authentication, users, roles, permissions, organizations, and profiles.",
  },
];

export default function FAQ() {
  return (
    <section style={{ padding: "72px 0" }}>
      <div style={{ marginBottom: 40 }}>
        <Badge variant="neutral">FAQ</Badge>
        <h2
          style={{
            marginTop: 18,
            fontSize: brand.typography.heading.h2,
            color: brand.colors.navy,
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.04em",
          }}
        >
          Common platform questions
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        {faqs.map((item) => (
          <Card key={item.question} variant="default">
            <h3
              style={{
                color: brand.colors.navy,
                fontSize: "1.15rem",
                fontWeight: brand.typography.weight.bold,
                marginBottom: 12,
              }}
            >
              {item.question}
            </h3>
            <p style={{ color: brand.colors.muted, lineHeight: 1.7 }}>{item.answer}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
