import { Badge, Button } from "@/components/ui";
import { Container } from "@/components/layout";
import { brand } from "@/constants/design";
import AIAnalyzer from "./AIAnalyzer";

export default function Hero() {
  return (
    <section className="bg-white py-20 md:py-28">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Badge variant="success">AI Operating System for Freelancers</Badge>

            <h1
              className="mt-8 text-5xl font-black leading-tight tracking-tight md:text-7xl"
              style={{ color: brand.colors.navy }}
            >
              The Commitment To Be{" "}
              <span style={{ color: brand.colors.red }}>The First</span>
            </h1>

            <p
              className="mt-6 max-w-2xl text-lg leading-8"
              style={{ color: brand.colors.muted }}
            >
              Dublancer combines Marketplace, AI Copilot, and Workspace into one intelligent
              platform for freelancers, agencies, and enterprises.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button variant="primary" size="lg">Start Free</Button>
              <Button variant="outline" size="lg">Explore Platform</Button>
            </div>
          </div>

          <AIAnalyzer />
        </div>
      </Container>
    </section>
  );
}
