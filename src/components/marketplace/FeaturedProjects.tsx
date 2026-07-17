import { Badge } from "@/components/ui";
import { brand } from "@/constants/design";
import ProjectGrid from "./ProjectGrid";

export default function FeaturedProjects() {
  return (
    <section style={{ padding: "56px 0" }}>
      <div style={{ marginBottom: 32 }}>
        <Badge variant="success">Featured Opportunities</Badge>
        <h2
          style={{
            marginTop: 18,
            color: brand.colors.navy,
            fontSize: brand.typography.heading.h2,
            fontWeight: brand.typography.weight.bold,
            letterSpacing: "-0.05em",
          }}
        >
          AI-ranked projects ready for expert delivery
        </h2>
      </div>
      <ProjectGrid />
    </section>
  );
}
