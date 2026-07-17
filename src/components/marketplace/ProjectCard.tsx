import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { brand } from "@/constants/design";
import SkillBadge from "./SkillBadge";

type ProjectCardProps = {
  id: string;
  title: string;
  description: string;
  budget: string;
  timeline: string;
  score: string;
  skills: string[];
  featured?: boolean;
};

export default function ProjectCard({
  id,
  title,
  description,
  budget,
  timeline,
  score,
  skills,
  featured = false,
}: ProjectCardProps) {
  return (
    <Card
      variant={featured ? "glass" : "elevated"}
      style={{
        display: "grid",
        gap: 18,
        minHeight: 330,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <Badge variant={featured ? "success" : "info"}>
          {featured ? "AI Recommended" : "Open Project"}
        </Badge>
        <Badge variant="success">Score {score}</Badge>
      </div>

      <div>
        <h3
          style={{
            color: brand.colors.navy,
            fontSize: "1.45rem",
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.03em",
            marginBottom: 12,
          }}
        >
          {title}
        </h3>
        <p style={{ color: brand.colors.muted, lineHeight: 1.7 }}>{description}</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div>
          <div style={{ color: brand.colors.muted, fontSize: brand.typography.body.sm }}>
            Budget
          </div>
          <strong style={{ color: brand.colors.navy }}>{budget}</strong>
        </div>
        <div>
          <div style={{ color: brand.colors.muted, fontSize: brand.typography.body.sm }}>
            Timeline
          </div>
          <strong style={{ color: brand.colors.navy }}>{timeline}</strong>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {skills.map((skill, index) => (
          <SkillBadge key={skill} label={skill} featured={index < 2} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
        <Link href={`/marketplace/project/${id}`} style={{ textDecoration: "none" }}>
          <Button variant="primary">View Project</Button>
        </Link>
        <Button variant="outline">Analyze with AI</Button>
      </div>
    </Card>
  );
}
