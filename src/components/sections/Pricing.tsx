import { Button, Card, Badge } from "@/components/ui";
import { Container } from "@/components/layout";
import { brand } from "@/constants/design";

const plans = [
  ["Starter", "$19/mo", "For individual freelancers", "neutral"],
  ["Professional", "$49/mo", "For serious freelancers", "success"],
  ["Agency", "$99/mo", "For teams and agencies", "info"],
] as const;

export default function Pricing() {
  return (
    <section className="py-20 md:py-28" style={{ backgroundColor: brand.colors.background }}>
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="info">Simple Pricing</Badge>
          <h2 className="mt-5 text-4xl font-black md:text-5xl" style={{ color: brand.colors.navy }}>
            Plans built for growth
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map(([name, price, desc, badge]) => (
            <Card key={name} variant="elevated">
              <Badge variant={badge}>{name}</Badge>
              <p className="mt-6 text-4xl font-black" style={{ color: brand.colors.green }}>{price}</p>
              <p className="mt-3" style={{ color: brand.colors.muted }}>{desc}</p>
              <Button variant="secondary" className="mt-8 w-full">Choose Plan</Button>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
