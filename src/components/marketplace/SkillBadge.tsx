import { Badge } from "@/components/ui";

type SkillBadgeProps = {
  label: string;
  featured?: boolean;
};

export default function SkillBadge({ label, featured = false }: SkillBadgeProps) {
  return <Badge variant={featured ? "success" : "neutral"}>{label}</Badge>;
}
