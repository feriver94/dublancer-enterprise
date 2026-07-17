"use client";

import { Badge } from "@/components/ui";
import { brand } from "@/constants/design";

const categories = [
  "AI Development",
  "Web Apps",
  "Mobile Apps",
  "Enterprise SaaS",
  "Automation",
  "Data & Analytics",
  "Cloud & DevOps",
  "Cybersecurity",
];

export default function CategoryFilter() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {categories.map((category, index) => (
        <button
          key={category}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Badge variant={index === 0 ? "success" : "neutral"}>{category}</Badge>
        </button>
      ))}
      <span style={{ color: brand.colors.muted, fontSize: brand.typography.body.sm }}>
        AI-ranked project discovery
      </span>
    </div>
  );
}
