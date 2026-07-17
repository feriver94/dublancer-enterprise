import PricingCard from "./PricingCard";

const plans = [
  {
    name: "Starter",
    price: "$0",
    badge: "Launch",
    description: "For individual freelancers testing AI-assisted work management.",
    features: ["AI Copilot preview", "Basic profile workspace", "Limited proposal drafts", "Project discovery access", "Community support"],
  },
  {
    name: "Business",
    price: "$49/mo",
    badge: "Most Popular",
    featured: true,
    description: "For serious freelancers, agencies, and delivery teams.",
    features: ["Unlimited AI proposals", "Workspace project rooms", "Marketplace intelligence", "Milestone and task tracking", "Invoice and billing workspace", "Team collaboration tools"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    badge: "Scale",
    description: "For organizations needing governance, security, and multi-team controls.",
    features: ["Organization management", "Roles and permissions", "Security center", "Audit logs", "Dedicated onboarding", "Custom AI and API integration"],
  },
];

export default function PricingPlans() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginBottom: 28 }}>
      {plans.map((plan) => <PricingCard key={plan.name} {...plan} />)}
    </section>
  );
}
