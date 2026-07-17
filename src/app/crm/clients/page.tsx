import { Navbar, Footer, Container } from "@/components/layout";
import { CRMStats, AccountDirectory } from "@/components/crm";

export default function ClientsPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <CRMStats />
          <AccountDirectory />
        </main>
      </Container>
      <Footer />
    </>
  );
}
