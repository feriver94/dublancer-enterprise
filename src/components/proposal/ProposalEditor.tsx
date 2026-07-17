"use client";

import { useState } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const initialProposal = `Hello,

I reviewed your requirement for an AI-powered freelance marketplace MVP. This should be treated as a premium SaaS platform, not a simple marketplace build.

Recommended delivery approach:
1. Platform foundation: design system, reusable layouts, routing, dashboard and authentication UI.
2. Marketplace core: project discovery, project details, opportunity scoring and proposal workspace.
3. Identity platform: users, roles, organizations, profiles and protected routes.
4. AI platform: proposal generation, project analysis, prompt workflows and provider-ready API architecture.
5. Commercial workflows: payments, contracts, escrow-ready structure and enterprise reporting.

This phased roadmap reduces delivery risk, creates demoable progress at every stage, and keeps the architecture scalable for enterprise, AI and government-ready modules.

Best regards,
Dublancer AI Copilot`;

export default function ProposalEditor() {
  const [proposal, setProposal] = useState(initialProposal);

  return (
    <Card variant="elevated" style={{ padding: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <Badge variant="info">Live Proposal Editor</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Client-ready proposal draft
          </h2>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Button variant="ghost">Rewrite</Button>
          <Button variant="outline">Shorten</Button>
        </div>
      </div>

      <textarea
        value={proposal}
        onChange={(event) => setProposal(event.target.value)}
        style={{
          width: "100%",
          minHeight: 620,
          resize: "vertical",
          border: `1px solid ${brand.colors.border}`,
          borderRadius: brand.radius.lg,
          padding: 26,
          color: brand.colors.text,
          background:
            "linear-gradient(180deg, rgba(248,250,252,.95), rgba(255,255,255,1))",
          lineHeight: 1.9,
          fontSize: brand.typography.body.md,
          outline: "none",
          boxShadow: "inset 0 1px 0 rgba(15,76,92,.04)",
        }}
      />
    </Card>
  );
}
