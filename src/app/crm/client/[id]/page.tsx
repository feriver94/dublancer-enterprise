import { Navbar, Footer, Container } from "@/components/layout";
import { Customer360, HealthScoring, DealPipeline, ContactCenter, RenewalExpansion, CRMAI, AccountDirectory } from "@/components/crm";

export default function ClientDetailsPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 28 }}>
              <Customer360 />
              <DealPipeline />
              <ContactCenter />
            </div>
            <aside style={{ display: "grid", gap: 24 }}>
              <HealthScoring />
              <CRMAI />
              <RenewalExpansion />
              <AccountDirectory />
            </aside>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
