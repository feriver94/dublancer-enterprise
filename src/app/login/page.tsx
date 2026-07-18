import { Navbar, Footer, Container } from "@/components/layout";
import { LoginForm } from "@/components/auth";
import { brand } from "@/constants/design";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
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
          <LoginForm returnTo={returnTo} />
        </main>
      </Container>
      <Footer />
    </>
  );
}
