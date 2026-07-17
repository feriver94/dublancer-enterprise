"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

type ModuleKey = "marketplace" | "workspace" | "files" | "ai" | "finance" | "analytics" | "search" | "admin";

const endpoints: Record<Exclude<ModuleKey, "workspace">, string> = {
  marketplace: "/api/marketplace/listings?take=25",
  files: "/api/files?take=25&parentId=root",
  ai: "/api/ai/runs",
  finance: "/api/finance/invoices",
  analytics: "/api/analytics/summary?days=30",
  search: "/api/search?q=project&scope=all&take=20",
  admin: "/api/admin/security-events",
};

export function ProductOperationsConsole() {
  const t = useTranslations("Product");
  const [module, setModule] = useState<ModuleKey>("marketplace");
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: unknown }>({ loading: false });

  const load = useCallback(async (target: ModuleKey = module) => {
    if (target === "workspace") {
      setState({ loading: false, error: t("workspaceHint") });
      return;
    }
    setState({ loading: true });
    try {
      const response = await fetch(endpoints[target], { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t("requestFailed"));
      setState({ loading: false, data: body.data });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : t("requestFailed") });
    }
  }, [module, t]);

  const moduleKeys: ModuleKey[] = ["marketplace", "workspace", "files", "ai", "finance", "analytics", "search", "admin"];
  return (
    <section className="product-console" aria-labelledby="product-console-title">
      <div className="product-console__header">
        <p className="product-console__eyebrow">{t("eyebrow")}</p>
        <h1 id="product-console-title">{t("title")}</h1>
        <p>{t("description")}</p>
      </div>
      <nav className="product-console__tabs" aria-label={t("modules")}>
        {moduleKeys.map((key) => (
          <button key={key} type="button" aria-pressed={module === key} onClick={() => { setModule(key); void load(key); }}>
            {t(`module.${key}`)}
          </button>
        ))}
      </nav>
      <div className="product-console__panel" aria-live="polite">
        <div className="product-console__panel-heading">
          <h2>{t(`module.${module}`)}</h2>
          <button type="button" onClick={() => void load()} disabled={state.loading}>{t("refresh")}</button>
        </div>
        {state.loading ? <p>{t("loading")}</p> : null}
        {state.error ? <p role="alert" className="product-console__error">{state.error}</p> : null}
        {state.data !== undefined ? <pre>{JSON.stringify(state.data, null, 2)}</pre> : null}
      </div>
    </section>
  );
}
