import {
  MetricCard,
  ActivityCard,
  ProjectCard,
  AIWidget,
  QuickActions,
} from "@/components/dashboard";
import { Navbar, Footer, Container } from "@/components/layout";

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <Container>
        <div style={{ padding: "72px 0", display: "grid", gap: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            <MetricCard title="Active Projects" value="12" change="+3 this week" variant="success" />
            <MetricCard title="AI Analyses" value="48" change="Live" variant="info" />
            <MetricCard title="Pending Tasks" value="7" change="Needs action" variant="danger" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
            <AIWidget />
            <QuickActions />
          </div>

          <ProjectCard
            title="AI Marketplace MVP"
            status="In Progress"
            budget="$8,000"
            skills={["Next.js", "NestJS", "AI", "PostgreSQL"]}
          />

          <ActivityCard />
        </div>
      </Container>
      <Footer />
    </>
  );
}