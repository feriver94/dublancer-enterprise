import { Button } from "@/components/ui";
import { Container } from "@/components/layout";
import { brand } from "@/constants/design";

export default function CTA() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <div className="rounded-[2rem] p-10 text-white md:p-16" style={{ backgroundColor: brand.colors.navy }}>
          <p className="font-bold" style={{ color: brand.colors.green }}>Powered by SoasTech</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black md:text-6xl">
            From proposal to delivery, Dublancer keeps freelancers moving forward.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">
            Start with AI proposals, then scale into client CRM, workspace, milestone tracking,
            marketplace intelligence, and enterprise workflows.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button variant="primary" size="lg">Generate Proposal</Button>
            <Button variant="ghost" size="lg" className="bg-white/10 text-white hover:bg-white/20">
              View Roadmap
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
