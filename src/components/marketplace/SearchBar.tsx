"use client";

import { Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function SearchBar() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: 12,
        border: `1px solid ${brand.colors.border}`,
        borderRadius: brand.radius.xl,
        background: brand.colors.white,
        boxShadow: brand.shadow.card,
      }}
    >
      <input
        placeholder="Search projects, skills, companies, or AI opportunities..."
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          padding: "14px 16px",
          fontSize: brand.typography.body.md,
          color: brand.colors.text,
          background: "transparent",
        }}
      />
      <Button variant="primary">Search</Button>
    </div>
  );
}
