import { Navbar, Footer, Container } from "@/components/layout";
import {
  ProjectHero,
  ProjectBrief,
  ClientProfile,
  ProjectAIInsight,
  ApplyPanel,
} from "@/components/marketplace";

export default function ProjectDetailsPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <ProjectHero />

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 360px",
              gap: 28,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 28 }}>
              <ProjectBrief />
              <ProjectAIInsight />
            </div>

            <aside style={{ display: "grid", gap: 24 }}>
              <ClientProfile />
              <ApplyPanel />
            </aside>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
