import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function EnterpriseCTA() {
  return (
    <Card variant="glass" style={{ padding: 40, background: "linear-gradient(135deg, rgba(15,76,92,.96), rgba(0,154,68,.86))" }}>
      <Badge variant="neutral">Enterprise Procurement</Badge>
      <h2 style={{ color: brand.colors.white, fontSize: brand.typography.heading.h2, fontWeight: brand.typography.weight.bold, letterSpacing: "-0.055em", marginTop: 18, marginBottom: 18, maxWidth: 860 }}>
        Need custom governance, AI policy, procurement, and private deployment support?
      </h2>
      <p style={{ color: "rgba(255,255,255,.86)", fontSize: brand.typography.body.lg, lineHeight: 1.8, maxWidth: 820, marginBottom: 28 }}>
        Enterprise plans can include dedicated onboarding, custom roles, API integrations, private AI provider routing, audit exports, and region-specific compliance workflows.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Button variant="secondary">Contact Sales</Button>
        <Button variant="outline">View Security Center</Button>
      </div>
    </Card>
  );
}
