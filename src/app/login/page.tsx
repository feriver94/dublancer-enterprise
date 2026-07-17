import { Navbar, Footer, Container } from "@/components/layout";
import { LoginForm } from "@/components/auth";
import { brand } from "@/constants/design";

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main
          style={{
            minHeight: "calc(100vh - 220px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "72px 0",
            background: brand.colors.white,
          }}
        >
          <LoginForm />
        </main>
      </Container>
      <Footer />
    </>
  );
}