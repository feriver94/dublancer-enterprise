import { Navbar, Footer, Container } from "@/components/layout";
import {
  ProposalCommandBar,
  ProposalHeader,
  ProposalExecutiveSummary,
  ProposalEditor,
  ProposalSidebar,
  ArchitecturePlan,
  MilestonePlan,
  PricingStrategy,
  AcceptanceCriteria,
} from "@/components/proposal";

export default function ProposalWorkspacePage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "56px 0 96px" }}>
          <ProposalCommandBar />
          <ProposalHeader />

          <section style={{ display: "grid", gap: 28, marginBottom: 28 }}>
            <ProposalExecutiveSummary />
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 380px",
              gap: 28,
              alignItems: "start",
              marginBottom: 28,
            }}
          >
            <ProposalEditor />
            <ProposalSidebar />
          </section>

          <section style={{ display: "grid", gap: 28 }}>
            <ArchitecturePlan />
            <MilestonePlan />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 28,
              }}
            >
              <PricingStrategy />
              <AcceptanceCriteria />
            </div>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
