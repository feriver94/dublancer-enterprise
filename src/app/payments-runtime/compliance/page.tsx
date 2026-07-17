import { Navbar, Footer, Container } from "@/components/layout";
import { PaymentsRuntimeHeader, PaymentsRuntimeStats, PaymentOrchestrator, EscrowLedger, PayoutOperations, RiskDecisioning, ReconciliationCenter, DisputeCenter, FinancialCompliance, TreasuryControls, PaymentsRuntimeAI } from "@/components/payments-runtime";

export default function Page() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px", display: "grid", gap: 28 }}>
          <FinancialCompliance/><RiskDecisioning/>
        </main>
      </Container>
      <Footer />
    </>
  );
}
