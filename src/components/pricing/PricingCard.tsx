import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

type PricingCardProps = {
  name: string;
  price: string;
  description: string;
  badge: string;
  featured?: boolean;
  features: string[];
};

export default function PricingCard({ name, price, description, badge, featured = false, features }: PricingCardProps) {
  return (
    <Card
      variant={featured ? "glass" : "elevated"}
      style={{
        padding: 34,
        border: featured ? `2px solid ${brand.colors.green}` : `1px solid ${brand.colors.border}`,
        background: featured ? "linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,250,252,.86))" : brand.colors.white,
      }}
    >
      <Badge variant={featured ? "success" : "info"}>{badge}</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 20, marginBottom: 8 }}>
        {name}
      </h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, minHeight: 54 }}>{description}</p>
      <div style={{ color: brand.colors.navy, fontSize: "2.6rem", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.05em", margin: "24px 0" }}>
        {price}
      </div>
      <Button variant={featured ? "primary" : "outline"}>{featured ? "Choose Business" : "Get Started"}</Button>
      <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
        {features.map((feature) => (
          <div key={feature} style={{ color: brand.colors.text, lineHeight: 1.6, paddingBottom: 12, borderBottom: `1px solid ${brand.colors.border}` }}>
            ✅ {feature}
          </div>
        ))}
      </div>
    </Card>
  );
}
