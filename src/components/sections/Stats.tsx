import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [
  { value: "AI-first", label: "Work Platform" },
  { value: "Global", label: "Freelance Marketplace" },
  { value: "Secure", label: "Contracts & Payments" },
  { value: "Enterprise", label: "Teams & Analytics" },
];

export default function Stats() {
  return (
    <section style={{ padding: "72px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <Badge variant="info">Platform Signals</Badge>
        <h2
          style={{
            marginTop: 18,
            fontSize: brand.typography.heading.h2,
            color: brand.colors.navy,
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.04em",
          }}
        >
          Built for serious digital work
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
        }}
      >
        {stats.map((item) => (
          <Card key={item.label} variant="elevated">
            <div
              style={{
                fontSize: "2rem",
                color: brand.colors.green,
                fontWeight: brand.typography.weight.bold,
                marginBottom: 8,
              }}
            >
              {item.value}
            </div>
            <div
              style={{
                color: brand.colors.text,
                fontWeight: brand.typography.weight.semibold,
              }}
            >
              {item.label}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
