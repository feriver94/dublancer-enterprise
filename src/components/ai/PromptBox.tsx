"use client";

import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";

type PromptBoxProps = {
  onAnalyze?: (prompt: string) => void;
};

export default function PromptBox({ onAnalyze }: PromptBoxProps) {
  const [prompt, setPrompt] = useState(
    "Build an AI-powered freelance marketplace with project posting, proposal generation, workspace, payments, contracts, analytics, and enterprise team management."
  );

  return (
    <Card
      variant="glass"
      style={{
        padding: 32,
        minHeight: 420,
        background:
          "linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.78))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <Badge variant="success">AI Project Intelligence</Badge>
        <Badge variant="neutral">Enterprise Mode</Badge>
      </div>

      <h2
        style={{
          color: brand.colors.navy,
          fontSize: "2rem",
          fontWeight: brand.typography.weight.bold,
          letterSpacing: "-0.04em",
          marginBottom: 12,
        }}
      >
        Describe your project
      </h2>

      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 24 }}>
        Dublancer AI analyzes scope, risk, budget, timeline, technology stack, and proposal strategy.
      </p>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Paste a client requirement or describe the product you want to build..."
        style={{
          width: "100%",
          minHeight: 180,
          resize: "vertical",
          padding: 18,
          borderRadius: brand.radius.lg,
          border: `1px solid ${brand.colors.border}`,
          color: brand.colors.text,
          background: brand.colors.white,
          fontSize: brand.typography.body.md,
          lineHeight: 1.7,
          outline: "none",
          boxShadow: "inset 0 1px 0 rgba(15,76,92,.04)",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 22,
        }}
      >
        <Button variant="primary" onClick={() => onAnalyze?.(prompt)}>
          Analyze Project
        </Button>
        <Button variant="outline">Generate Proposal</Button>
        <span style={{ color: brand.colors.muted, fontSize: brand.typography.body.sm }}>
          Output is currently static MVP data and ready for API integration.
        </span>
      </div>
    </Card>
  );
}
