import { Navbar, Footer, Container } from "@/components/layout";
import {
  PricingHeader,
  PricingPlans,
  FeatureComparison,
  EnterpriseCTA,
  PricingFAQ,
} from "@/components/pricing";

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <PricingHeader />
          <PricingPlans />
          <FeatureComparison />
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 28 }}>
            <EnterpriseCTA />
            <PricingFAQ />
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
