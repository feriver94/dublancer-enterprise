"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

export type EnterpriseModule = "dashboard" | "marketplace" | "workspace" | "collaboration" | "notifications" | "files" | "ai" | "contracts" | "finance" | "orchestration" | "analytics" | "search" | "admin";

const endpoints: Record<EnterpriseModule, string> = {
  dashboard: "/api/operations/summary",
  marketplace: "/api/marketplace/listings?take=25",
  workspace: "/api/projects?take=25",
  collaboration: "/api/chat/channels?take=25",
  notifications: "/api/notifications?take=25",
  files: "/api/files?take=25",
  ai: "/api/ai/runs",
  contracts: "/api/contracts",
  finance: "/api/billing/summary",
  orchestration: "/api/orchestration/overview",
  analytics: "/api/analytics/summary?days=30",
  search: "/api/search?q=project&scope=all&take=25",
  admin: "/api/admin/moderation",
};
const modules = Object.keys(endpoints) as EnterpriseModule[];
type Body = { data?: unknown; error?: { message?: string } };

function value(input: unknown, locale: string) {
  if (input == null) return "—";
  if (typeof input === "number") return new Intl.NumberFormat(locale).format(input);
  if (typeof input === "string" && /^\d{4}-\d\d-\d\dT/.test(input)) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(input));
  }
  if (typeof input === "object") return JSON.stringify(input);
  return String(input);
}

export function DataView({ data, locale, empty, module }: { data: unknown; locale: string; empty: string; module: EnterpriseModule }) {
  const rows = Array.isArray(data) ? data : data && typeof data === "object" && "items" in data ? (data as { items: unknown[] }).items : null;
  if (rows) {
    if (!rows.length) return <div className="enterprise-empty">{empty}</div>;
    return <div className="enterprise-records">{rows.map((item, index) => {
      const record: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : { value: item };
      const title = String(record.title ?? record.name ?? record.subject ?? record.number ?? record.type ?? `#${index + 1}`);
      const href = record.id && module === "workspace" ? `/workspace/project/${record.id}`
        : record.id && module === "marketplace" ? `/marketplace/project/${record.id}`
        : record.id && module === "contracts" ? `/contracts/${record.id}`
        : null;
      return <article className="enterprise-record" key={String(record.id ?? index)}>
        <div className="enterprise-record__title"><strong>{href ? <Link href={href}>{title}</Link> : title}</strong>{record.status ? <span>{String(record.status)}</span> : null}</div>
        <dl>{Object.entries(record)
          .filter(([key, entry]) => !["id", "title", "name", "description", "body", "metadata", "input", "output", "terms"].includes(key) && typeof entry !== "object")
          .slice(0, 8)
          .map(([key, entry]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value(entry, locale)}</dd></div>)}</dl>
        {typeof record.description === "string" ? <p>{record.description}</p> : null}
      </article>;
    })}</div>;
  }
  if (data && typeof data === "object") return <div className="enterprise-metrics">{Object.entries(data as Record<string, unknown>).map(([key, entry]) => <article key={key}>
    <span>{key.replace(/([A-Z])/g, " $1")}</span>{typeof entry === "object" ? <pre>{JSON.stringify(entry, null, 2)}</pre> : <strong>{value(entry, locale)}</strong>}
  </article>)}</div>;
  return <div className="enterprise-empty">{empty}</div>;
}

export function EnterprisePlatformConsole({ initialModule = "dashboard" }: { initialModule?: EnterpriseModule }) {
  const t = useTranslations("EnterpriseConsole");
  const locale = useLocale();
  const [module, setModule] = useState<EnterpriseModule>(initialModule);
  const [data, setData] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async (url = endpoints[module]) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as Body;
      if (!response.ok) throw new Error(body.error?.message ?? t("requestFailed"));
      setData(body.data);
    } catch (cause) {
      setData(undefined);
      setError(cause instanceof Error ? cause.message : t("requestFailed"));
    } finally { setLoading(false); }
  }, [module, t]);
  useEffect(() => { const task = setTimeout(() => void load(), 0); return () => clearTimeout(task); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setError("");
    try {
      if (module === "search") { await load(`/api/search?q=${encodeURIComponent(String(fields.get("query") ?? ""))}&scope=all&take=25`); return; }
      const action = build(module, fields);
      if (!action) return;
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrfBody = await csrfResponse.json();
      const response = await fetch(action.url, { method: action.method, headers: { "content-type": "application/json", "x-csrf-token": csrfBody.data?.csrfToken ?? "" }, body: JSON.stringify(action.body) });
      const body = await response.json() as Body;
      if (!response.ok) throw new Error(body.error?.message ?? t("requestFailed"));
      setNotice(t("completed")); form.reset(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("requestFailed")); }
  }

  return <section className="enterprise-console">
    <header className="enterprise-console__header"><div><p>{t("eyebrow")}</p><h1>{t(`module.${module}`)}</h1><span>{t(`description.${module}`)}</span></div><button onClick={() => void load()}>{t("refresh")}</button></header>
    <nav className="enterprise-console__nav" aria-label={t("modules")}>{modules.map((key) => <button key={key} aria-current={module === key ? "page" : undefined} onClick={() => { setModule(key); setNotice(""); }}>{t(`module.${key}`)}</button>)}</nav>
    <div className="enterprise-console__grid"><main className="enterprise-console__data">{loading ? <div className="enterprise-loading">{t("loading")}</div> : <DataView data={data} locale={locale} empty={t("empty")} module={module} />}</main>
      <aside className="enterprise-console__actions"><h2>{t("quickAction")}</h2><Action module={module} onSubmit={submit} t={(key) => t(key)} />{notice ? <p className="enterprise-notice">{notice}</p> : null}{error ? <p className="enterprise-error" role="alert">{error}</p> : null}<div className="enterprise-boundary"><strong>{t("providerBoundary")}</strong><p>{t("providerHelp")}</p></div></aside></div>
  </section>;
}

function Action({ module, onSubmit, t }: { module: EnterpriseModule; onSubmit: (event: FormEvent<HTMLFormElement>) => void; t: (key: string) => string }) {
  if (["dashboard", "notifications", "contracts", "analytics"].includes(module)) return <p>{t("readOnly")}</p>;
  return <form className="enterprise-form" onSubmit={onSubmit}>
    {module === "marketplace" ? <><label>{t("title")}<input name="title" required /></label><label>{t("descriptionLabel")}<textarea name="description" required /></label><label>{t("amount")}<input name="amount" defaultValue="10000" /></label></> : null}
    {module === "workspace" ? <><label>{t("title")}<input name="title" required /></label><label>{t("slug")}<input name="slug" required /></label></> : null}
    {module === "collaboration" ? <label>{t("channelName")}<input name="name" required /></label> : null}
    {module === "files" ? <label>{t("folderName")}<input name="name" required /></label> : null}
    {module === "ai" ? <><label>{t("useCase")}<select name="useCase"><option value="workspace_summary">workspace_summary</option><option value="proposal_assistant">proposal_assistant</option><option value="risk_detection">risk_detection</option></select></label><label>{t("instructions")}<textarea name="instructions" required /></label></> : null}
    {module === "orchestration" ? <><label>{t("workflowName")}<input name="name" required /></label><label>{t("workflowKey")}<input name="key" required /></label></> : null}
    {module === "search" ? <label>{t("searchQuery")}<input name="query" required /></label> : null}
    {module === "admin" ? <><label>{t("subject")}<input name="subject" required /></label><label>{t("descriptionLabel")}<textarea name="description" required /></label></> : null}
    <button type="submit">{t("submit")}</button>
  </form>;
}

function build(module: EnterpriseModule, fields: FormData) {
  const field = (key: string) => String(fields.get(key) ?? "").trim();
  if (module === "marketplace") return { url: "/api/marketplace/listings", method: "POST", body: { title: field("title"), description: field("description"), engagementType: "FIXED_PRICE", experienceLevel: "INTERMEDIATE", budgetMaxMinor: field("amount"), currency: "AED", visibility: "PUBLIC", remoteAllowed: true, publish: true, skillIds: [] } };
  if (module === "workspace") return { url: "/api/projects", method: "POST", body: { title: field("title"), slug: field("slug"), currency: "AED" } };
  if (module === "collaboration") return { url: "/api/chat/channels", method: "POST", body: { type: "GROUP", visibility: "ORGANIZATION", name: field("name"), memberUserIds: [] } };
  if (module === "files") return { url: "/api/files", method: "POST", body: { name: field("name") } };
  if (module === "ai") return { url: "/api/ai/runs", method: "POST", body: { useCase: field("useCase"), input: { instructions: field("instructions") }, idempotencyKey: crypto.randomUUID() } };
  if (module === "orchestration") return { url: "/api/orchestration/definitions", method: "POST", body: { key: field("key"), name: field("name"), publish: true, concurrencyLimit: 10, timeoutSeconds: 3600, graph: { nodes: [{ key: "prepare", name: "Prepare", type: "ANALYTICS_EVENT", maxAttempts: 3, config: {} }, { key: "approve", name: "Human approval", type: "HUMAN_APPROVAL", maxAttempts: 1, config: {} }], edges: [{ from: "prepare", to: "approve" }] } } };
  if (module === "admin") return { url: "/api/admin/support-cases", method: "POST", body: { subject: field("subject"), description: field("description"), priority: "NORMAL" } };
  return null;
}
