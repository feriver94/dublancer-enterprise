import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

type ProjectCardProps = {
  title: string;
  status: string;
  budget: string;
  skills: string[];
};

export default function ProjectCard({ title, status, budget, skills }: ProjectCardProps) {
  return (
    <Card variant="elevated">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <h3
          style={{
            color: brand.colors.navy,
            fontSize: "1.25rem",
            fontWeight: brand.typography.weight.bold,
            margin: 0,
          }}
        >
          {title}
        </h3>
        <Badge variant="success">{status}</Badge>
      </div>

      <p style={{ color: brand.colors.muted, marginBottom: 20 }}>Estimated Budget: {budget}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {skills.map((skill) => (
          <Badge key={skill} variant="neutral">
            {skill}
          </Badge>
        ))}
      </div>

      <Button variant="outline">View Project</Button>
    </Card>
  );
}
