import { Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function ProposalCommandBar() {
  return (
    <div
      style={{
        position: "sticky",
        top: 96,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 28,
        padding: "14px 18px",
        borderRadius: brand.radius.xl,
        border: `1px solid ${brand.colors.border}`,
        background: "rgba(255,255,255,.92)",
        backdropFilter: "blur(16px)",
        boxShadow: brand.shadow.card,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Badge variant="success">AI Proposal Workspace</Badge>
        <Badge variant="info">Project: AI Marketplace MVP</Badge>
        <Badge variant="neutral">Draft v1.0</Badge>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button variant="ghost">Save</Button>
        <Button variant="outline">Preview</Button>
        <Button variant="primary">Submit Proposal</Button>
      </div>
    </div>
  );
}
