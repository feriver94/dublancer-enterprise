import { Navbar, Footer, Container } from "@/components/layout";
import { PaymentsRuntimeHeader, PaymentsRuntimeStats, PaymentOrchestrator, EscrowLedger, PayoutOperations, RiskDecisioning, ReconciliationCenter, DisputeCenter, FinancialCompliance, TreasuryControls, PaymentsRuntimeAI } from "@/components/payments-runtime";

export default function Page() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px", display: "grid", gap: 28 }}>
          <PaymentsRuntimeHeader/><PaymentsRuntimeStats/><section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 380px",gap:28}}><div style={{display:"grid",gap:28}}><PaymentOrchestrator/><EscrowLedger/><PayoutOperations/><ReconciliationCenter/></div><aside style={{display:"grid",gap:24}}><PaymentsRuntimeAI/><RiskDecisioning/><DisputeCenter/><TreasuryControls/></aside></section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
