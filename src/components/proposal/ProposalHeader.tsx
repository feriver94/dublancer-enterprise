import { Badge, Button, Card } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ProposalHeader() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        marginBottom: 28,
        borderRadius: brand.radius.xl,
        border: `1px solid ${brand.colors.border}`,
        background:
          "radial-gradient(circle at 15% 20%, rgba(0,154,68,.16), transparent 34%), radial-gradient(circle at 85% 15%, rgba(15,76,92,.13), transparent 32%), linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: "0 24px 80px rgba(15,76,92,.10)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 28,
          alignItems: "center",
          padding: "56px 48px",
        }}
      >
        <div>
          <Badge variant="success">Enterprise Proposal OS</Badge>
          <h1
            style={{
              color: brand.colors.navy,
              fontSize: "clamp(2.8rem, 6vw, 5.8rem)",
              fontWeight: brand.typography.weight.bold,
              letterSpacing: "-0.075em",
              lineHeight: 0.9,
              marginTop: 22,
              marginBottom: 22,
              maxWidth: 920,
            }}
          >
            Turn client requirements into an investor-grade proposal.
          </h1>
          <p
            style={{
              color: brand.colors.muted,
              fontSize: brand.typography.body.lg,
              lineHeight: 1.85,
              maxWidth: 820,
              marginBottom: 30,
            }}
          >
            Dublancer AI converts project intelligence into a polished proposal with strategy,
            milestones, commercial plan, risk controls, delivery architecture, and acceptance criteria.
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Button variant="primary">Generate Proposal</Button>
            <Button variant="outline">Improve Draft</Button>
            <Button variant="ghost">Export PDF</Button>
          </div>
        </div>

        <Card variant="glass" style={{ padding: 26 }}>
          <Badge variant="info">Workspace Health</Badge>
          {[
            ["Proposal Readiness", "94%"],
            ["Scope Coverage", "Complete"],
            ["Pricing Confidence", "High"],
            ["Risk Control", "Structured"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                padding: "18px 0",
                borderBottom: `1px solid ${brand.colors.border}`,
              }}
            >
              <span style={{ color: brand.colors.muted }}>{label}</span>
              <strong style={{ color: brand.colors.navy }}>{value}</strong>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}
