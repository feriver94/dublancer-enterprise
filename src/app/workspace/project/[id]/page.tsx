import { Navbar, Footer, Container } from "@/components/layout";
import {
  ProjectRoomHeader,
  ProjectHealthPanel,
  MilestoneTracker,
  DecisionLog,
  RiskRegister,
  TeamPanel,
  MessageThread,
  ProjectFilesPanel,
  ProjectRoomAI,
} from "@/components/workspace";

export default function WorkspaceProjectRoomPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <ProjectRoomHeader />
          <ProjectHealthPanel />

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 380px",
              gap: 28,
              alignItems: "start",
              marginBottom: 28,
            }}
          >
            <div style={{ display: "grid", gap: 28 }}>
              <MilestoneTracker />
              <DecisionLog />
              <RiskRegister />
              <MessageThread />
            </div>

            <aside style={{ display: "grid", gap: 24 }}>
              <ProjectRoomAI />
              <TeamPanel />
              <ProjectFilesPanel />
            </aside>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
