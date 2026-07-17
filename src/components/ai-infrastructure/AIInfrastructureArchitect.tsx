import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const insights = [
  "Model routing should be policy-driven by tenant, data sensitivity, task type, cost budget, and fallback requirements.",
  "RAG must always return citations and source lineage before enterprise users can trust generated answers.",
  "Vector storage should be tenant-isolated and linked to Knowledge Graph entity IDs for stronger retrieval quality.",
  "AI evals should run in CI/CD so every prompt, retrieval, and model-router change is quality-gated before production.",
  "Memory lifecycle must support retention, deletion, masking, and audit evidence for enterprise and government adoption.",
];

export default function AIInfrastructureArchitect() {
  return (
    <Card variant="glass" style={{ background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(248,250,252,.82))" }}>
      <Badge variant="success">AI Infrastructure Architect</Badge>
      <h2 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 12 }}>Production AI infrastructure recommendations</h2>
      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 22 }}>AI reviews routing policy, retrieval quality, memory safety, evaluation coverage, and cost governance.</p>
      <div style={{ display: "grid", gap: 12 }}>
        {insights.map((insight) => (
          <div key={insight} style={{ padding: 14, borderRadius: brand.radius.md, background: brand.colors.white, border: `1px solid ${brand.colors.border}`, color: brand.colors.text, lineHeight: 1.6 }}>{insight}</div>
        ))}
      </div>
    </Card>
  );
}
