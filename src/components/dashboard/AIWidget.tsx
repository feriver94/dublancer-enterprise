"use client";

import { useTranslations } from "next-intl";
import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

export default function AIWidget() {
  const t = useTranslations("Dashboard");
  return (
    <Card variant="glass">
      <Badge variant="success">{t("aiCopilot")}</Badge>

      <h3
        style={{
          color: brand.colors.navy,
          fontSize: brand.typography.heading.h3,
          fontWeight: brand.typography.weight.bold,
          marginTop: 24,
          marginBottom: 12,
        }}
      >
        {t("aiReady")}
      </h3>

      <p style={{ color: brand.colors.muted, lineHeight: 1.7, marginBottom: 24 }}>
        {t("aiDescription")}
      </p>

      <Button variant="primary">{t("runAiAnalysis")}</Button>
    </Card>
  );
}
