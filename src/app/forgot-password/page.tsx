import { Navbar, Footer, Container } from "@/components/layout";
import { ForgotPasswordForm } from "@/components/auth";
import { brand } from "@/constants/design";

export default function ForgotPasswordPage() {
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
          <ForgotPasswordForm />
        </main>
      </Container>
      <Footer />
    </>
  );
}