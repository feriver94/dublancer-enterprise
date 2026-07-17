import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const stats = [["Security Score","98%","success"],["Open Incidents","4","info"],["Blocked Threats","1.8k","success"],["MFA Coverage","96%","success"],["Compliance Health","94%","neutral"],["Audit Events","8.2M","info"]];

export default function SecurityStats() {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 20, marginBottom: 28 }}>
      {stats.map(([label, value, variant]) => (
        <Card key={label} variant="elevated">
          <Badge variant={variant as "success" | "info" | "neutral"}>{label}</Badge>
          <div style={{ marginTop: 18, color: brand.colors.navy, fontSize: "2.25rem", fontWeight: brand.typography.weight.bold, letterSpacing: "-0.045em" }}>{value}</div>
        </Card>
      ))}
    </section>
  );
}
