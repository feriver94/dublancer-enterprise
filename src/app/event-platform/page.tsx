import { Navbar, Footer, Container } from "@/components/layout";
import { EventPlatformHeader, EventPlatformStats, TopicRegistry, SubscriptionManager, SchedulerRuntime, SchemaRegistry, ReplayConsole, DeadLetterQueue, ConsumerHealth, EventGovernance, EventPlatformArchitect } from "@/components/event-platform";

export default function Page() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px", display: "grid", gap: 28 }}>
          <EventPlatformHeader/><EventPlatformStats/><section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 380px",gap:28}}><div style={{display:"grid",gap:28}}><TopicRegistry/><SubscriptionManager/><SchedulerRuntime/><SchemaRegistry/></div><aside style={{display:"grid",gap:24}}><EventPlatformArchitect/><ConsumerHealth/><DeadLetterQueue/><EventGovernance/></aside></section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
