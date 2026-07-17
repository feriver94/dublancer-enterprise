import ProjectCard from "./ProjectCard";

const projects = [
  {
    id: "ai-marketplace-mvp",
    title: "AI Freelance Marketplace MVP",
    description:
      "Build a marketplace with AI proposal generation, verified talent profiles, workspace, payments, and admin analytics.",
    budget: "$8,000-$14,000",
    timeline: "6-8 weeks",
    score: "94%",
    skills: ["Next.js", "NestJS", "PostgreSQL", "OpenAI", "Stripe"],
    featured: true,
  },
  {
    id: "enterprise-dashboard",
    title: "Enterprise Analytics Dashboard",
    description:
      "Create a high-performance executive dashboard with team metrics, project reporting, forecasting, and permission controls.",
    budget: "$4,500-$9,000",
    timeline: "4-6 weeks",
    score: "88%",
    skills: ["React", "Charts", "RBAC", "API", "Data"],
    featured: false,
  },
  {
    id: "ai-agent-automation",
    title: "AI Agent Workflow Automation",
    description:
      "Design AI agents for lead qualification, document analysis, email automation, and business process orchestration.",
    budget: "$6,000-$12,000",
    timeline: "5-7 weeks",
    score: "91%",
    skills: ["AI Agents", "Python", "OpenAI", "Automation", "APIs"],
    featured: true,
  },
];

export default function ProjectGrid() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 24,
      }}
    >
      {projects.map((project) => (
        <ProjectCard key={project.id} {...project} />
      ))}
    </section>
  );
}
