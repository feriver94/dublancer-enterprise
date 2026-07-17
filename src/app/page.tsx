import { Navbar, Footer, Container } from "@/components/layout";
import {
  Hero,
  AIAnalyzer,
  Features,
  Stats,
  HowItWorks,
  Testimonials,
  Pricing,
  FAQ,
  CTA,
} from "@/components/sections";

export default function Home() {
  return (
    <>
      <Navbar />
      <Container>
        <Hero />
        <AIAnalyzer />
        <Features />
        <Stats />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </Container>
      <Footer />
    </>
  );
}
