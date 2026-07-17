import { Card } from "@/components/ui";
import { Container } from "@/components/layout";
import { brand } from "@/constants/design";

const features = [
  ["AI Proposal Generator", "Generate winning proposals with questions and copy-ready structure."],
  ["Bid Advisor", "Suggest pricing, timeline, and bidding strategy with confidence."],
  ["Win Score", "Analyze project fit, budget, urgency, and competition."],
  ["Client Analyzer", "Extract client needs, risks, and decision triggers."],
  ["Workspace", "Manage projects, notes, milestones, tasks, and delivery workflows."],
  ["Marketplace", "Future talent marketplace powered by AI matching and trust signals."],
];

export default function Features() {
  return (
    <section className="py-20 md:py-28" style={{ backgroundColor: brand.colors.background }}>
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-black md:text-5xl" style={{ color: brand.colors.navy }}>
            Built for the future of digital work
          </h2>
          <p className="mt-5 text-lg leading-8" style={{ color: brand.colors.muted }}>
            Dublancer is designed as a complete AI work platform, not just another freelance marketplace.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map(([title, desc], index) => {
            const color = index % 3 === 0 ? brand.colors.green : index % 3 === 1 ? brand.colors.red : brand.colors.navy;
            return (
              <Card key={title} className="transition hover:-translate-y-1 hover:shadow-xl">
                <div className="mb-5 h-12 w-12 rounded-2xl" style={{ backgroundColor: color }} />
                <h3 className="text-xl font-black" style={{ color: brand.colors.navy }}>{title}</h3>
                <p className="mt-3 leading-7" style={{ color: brand.colors.muted }}>{desc}</p>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
