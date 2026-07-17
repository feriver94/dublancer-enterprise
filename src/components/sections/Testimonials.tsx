import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const testimonials = [
  {
    quote:
      "Dublancer is being shaped as more than a marketplace. It feels like an AI operating system for finding, managing, and delivering work.",
    name: "Enterprise Client",
    role: "Digital Transformation",
  },
  {
    quote:
      "The combination of AI Copilot, marketplace workflows, contracts, and workspace gives freelancers a much stronger professional layer.",
    name: "Verified Freelancer",
    role: "Global Talent Network",
  },
  {
    quote:
      "The platform direction is premium, structured, and scalable enough for serious teams, agencies, and government-ready workflows.",
    name: "Platform Advisor",
    role: "SaaS Strategy",
  },
];

export default function Testimonials() {
  return (
    <section style={{ padding: "72px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <Badge variant="info">Trusted Direction</Badge>
        <h2
          style={{
            marginTop: 18,
            fontSize: brand.typography.heading.h2,
            color: brand.colors.navy,
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.04em",
          }}
        >
          Designed for clients, freelancers, and teams
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
        }}
      >
        {testimonials.map((item) => (
          <Card key={item.name} variant="glass">
            <p
              style={{
                color: brand.colors.text,
                lineHeight: 1.8,
                fontSize: brand.typography.body.md,
                marginBottom: 28,
              }}
            >
              “{item.quote}”
            </p>
            <div style={{ fontWeight: brand.typography.weight.bold, color: brand.colors.navy }}>
              {item.name}
            </div>
            <div style={{ color: brand.colors.muted, marginTop: 4 }}>{item.role}</div>
          </Card>
        ))}
      </div>
    </section>
  );
}
