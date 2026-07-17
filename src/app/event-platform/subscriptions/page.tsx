import { Navbar, Footer, Container } from "@/components/layout";
import { EventPlatformHeader, EventPlatformStats, TopicRegistry, SubscriptionManager, SchedulerRuntime, SchemaRegistry, ReplayConsole, DeadLetterQueue, ConsumerHealth, EventGovernance, EventPlatformArchitect } from "@/components/event-platform";

export default function Page() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px", display: "grid", gap: 28 }}>
          <SubscriptionManager/><ConsumerHealth/>
        </main>
      </Container>
      <Footer />
    </>
  );
}
