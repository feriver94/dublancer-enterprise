import { Navbar, Footer, Container } from "@/components/layout";
import { InvoiceTable, PaymentMethods, CompliancePanel, TransactionFeed } from "@/components/payments";

export default function BillingPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 28 }}>
              <InvoiceTable />
            </div>
            <aside style={{ display: "grid", gap: 24 }}>
              <PaymentMethods />
              <CompliancePanel />
              <TransactionFeed />
            </aside>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
