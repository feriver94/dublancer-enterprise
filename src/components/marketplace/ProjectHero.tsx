import { Badge, Button, Card } from "@/components/ui";
import { brand } from "@/constants/design";
import SkillBadge from "./SkillBadge";

const skills = ["Next.js", "NestJS", "PostgreSQL", "OpenAI", "Stripe", "Docker"];

export default function ProjectHero() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, .75fr)",
        gap: 28,
        alignItems: "start",
        marginBottom: 32,
      }}
    >
      <Card variant="glass" style={{ padding: 36 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <Badge variant="success">AI Recommended</Badge>
          <Badge variant="info">Enterprise SaaS</Badge>
          <Badge variant="neutral">Verified Client</Badge>
        </div>

        <h1
          style={{
            color: brand.colors.navy,
            fontSize: "clamp(2.4rem, 5vw, 4.8rem)",
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.06em",
            lineHeight: 0.95,
            marginBottom: 24,
          }}
        >
          AI Freelance Marketplace MVP
        </h1>

        <p
          style={{
            color: brand.colors.muted,
            fontSize: brand.typography.body.lg,
            lineHeight: 1.8,
            maxWidth: 820,
            marginBottom: 28,
          }}
        >
          Build a premium AI-powered freelance marketplace with project posting, proposal generation,
          verified talent profiles, workspace, payments, contracts, analytics, and enterprise admin.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 30 }}>
          {skills.map((skill, index) => (
            <SkillBadge key={skill} label={skill} featured={index < 3} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Button variant="primary">Apply Now</Button>
          <Button variant="outline">Analyze with AI</Button>
          <Button variant="ghost">Save Project</Button>
        </div>
      </Card>

      <Card variant="elevated" style={{ padding: 32 }}>
        <Badge variant="success">Opportunity Score</Badge>
        <div
          style={{
            marginTop: 20,
            marginBottom: 24,
            width: 120,
            height: 120,
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            background: "rgba(0,154,68,.12)",
            border: "1px solid rgba(0,154,68,.25)",
            color: brand.colors.green,
            fontSize: "2.4rem",
            fontWeight: brand.typography.weight.bold,
          }}
        >
          94%
        </div>

        {[
          ["Budget", "$8,000-$14,000"],
          ["Timeline", "6-8 weeks"],
          ["Experience", "Senior / Expert"],
          ["Risk Level", "Controlled"],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "16px 0",
              borderTop: `1px solid ${brand.colors.border}`,
            }}
          >
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ color: brand.colors.navy }}>{value}</strong>
          </div>
        ))}
      </Card>
    </section>
  );
}
