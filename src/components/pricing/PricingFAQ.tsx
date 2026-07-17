import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const faqs = [
  ["Can I start free?", "Yes. The Starter plan is designed for early testing and individual users."],
  ["Is AI included?", "Yes. AI capabilities scale by plan and can later connect to real providers."],
  ["Do you support organizations?", "Yes. Business and Enterprise plans include team and organization workflows."],
  ["Can enterprise pricing be customized?", "Yes. Enterprise pricing is designed around users, security needs, AI usage, and integrations."],
];

export default function PricingFAQ() {
  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <Badge variant="neutral">FAQ</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 24 }}>
        Pricing questions
      </h2>
      <div style={{ display: "grid", gap: 14 }}>
        {faqs.map(([question, answer]) => (
          <div key={question} style={{ padding: 18, borderRadius: brand.radius.lg, background: brand.colors.background, border: `1px solid ${brand.colors.border}` }}>
            <strong style={{ color: brand.colors.navy }}>{question}</strong>
            <p style={{ color: brand.colors.muted, lineHeight: 1.7, margin: "8px 0 0" }}>{answer}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
