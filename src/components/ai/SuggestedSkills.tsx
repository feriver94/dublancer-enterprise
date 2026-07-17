import { Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const skills = [
  "Next.js",
  "NestJS",
  "PostgreSQL",
  "Redis",
  "OpenAI API",
  "Docker",
  "RBAC",
  "Stripe",
  "CI/CD",
  "Observability",
];

export default function SuggestedSkills() {
  return (
    <Card variant="default">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <Badge variant="neutral">Recommended Stack</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: "1.6rem",
              fontWeight: brand.typography.weight.bold,
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            Skills and technologies
          </h2>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {skills.map((skill, index) => (
          <Badge key={skill} variant={index < 4 ? "success" : "neutral"}>
            {skill}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
