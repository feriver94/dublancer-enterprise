"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useState } from "react";
import { apiGet, apiGetWithMeta, apiMutation } from "@/lib/client/api-client";
import type { AppLocale } from "@/i18n/config";
import { formatUaeDateTime } from "@/lib/locale/formatters";

type Result = { id: string; entityType: string; entityId: string; title: string; body: string; highlight: string; rank: number; indexedAt: string; metadata: { href?: string; status?: string } | null };
type IndexStatus = { checkpoint: { status: string; lastIndexedAt: string | null; lastFullReindexAt: string | null; documentCount: number; lastError: string | null } | null; pendingJobs: number };

function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
function safeHref(value?: string) { return value?.startsWith("/") && !value.startsWith("//") ? value : null; }

function Highlight({ value, query }: { value: string; query: string }) {
  const marked = value.includes("[[[") ? value : value.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "[[[$1]]]");
  const parts = marked.split(/\[\[\[(.*?)\]\]\]/g);
  return <>{parts.map((part, index) => <Fragment key={`${index}:${part.slice(0, 8)}`}>{index % 2 === 1 ? <mark className="rounded bg-amber-200 px-0.5">{part}</mark> : part}</Fragment>)}</>;
}

export function SearchProductClient({ canReindex }: { canReindex: boolean }) {
  const t = useTranslations("Search");
  const statusLabel = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const time = (value?: string | null) => value ? formatUaeDateTime(value, locale) : t("never");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [items, setItems] = useState<Result[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    try { setStatus(await apiGet<IndexStatus>("/api/search/reindex")); }
    catch (reason) { setError(message(reason, t("healthFailed"))); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void loadStatus(), 0); return () => clearTimeout(timer); }, [loadStatus]);

  async function search(next?: string, append = false, queryValue = submitted, typeValue = entityType) {
    if (queryValue.trim().length < 2) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const parameters = new URLSearchParams({ q: queryValue.trim(), entityType: typeValue, take: "20" });
      if (next) parameters.set("cursor", next);
      const result = await apiGetWithMeta<Result[]>(`/api/search?${parameters}`);
      setItems((current) => append ? [...current, ...result.data] : result.data);
      setCursor(typeof result.meta.nextCursor === "string" ? result.meta.nextCursor : null);
    } catch (reason) { setError(message(reason, t("searchFailed"))); }
    finally { setLoading(false); }
  }

  async function reindex() {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiMutation("/api/search/reindex", "POST", { idempotencyKey: crypto.randomUUID() });
      setNotice(t("reindexQueued"));
      await loadStatus();
    } catch (reason) { setError(message(reason, t("reindexFailed"))); }
    finally { setBusy(false); }
  }

  return <main className="py-12 lg:py-16">
    <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
      <div><p className="font-bold uppercase tracking-[.18em] text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1><p className="mt-2 text-slate-600">{t("description")}</p></div>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><strong className="text-[#0F4C5C]">{t("indexHealth")}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${status?.checkpoint?.status === "FAILED" ? "bg-red-50 text-red-700" : status?.pendingJobs ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{status?.checkpoint?.status ? (statusLabel.has(status.checkpoint.status) ? statusLabel(status.checkpoint.status) : status.checkpoint.status) : t("notStarted")}</span></div><p className="mt-2 text-sm text-slate-600">{t("documentStatus", { count: status?.checkpoint?.documentCount ?? 0, time: time(status?.checkpoint?.lastIndexedAt) })}</p>{status?.checkpoint?.lastError ? <p className="mt-2 text-xs text-red-600">{status.checkpoint.lastError}</p> : null}{canReindex ? <button type="button" disabled={busy} onClick={() => void reindex()} className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold">{busy ? t("queuing") : t("reindex")}</button> : null}</aside>
    </header>
    {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : null}
    {notice ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</div> : null}
    <form className="mt-7 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row" onSubmit={(event) => { event.preventDefault(); const value = query.trim(); setSubmitted(value); void search(undefined, false, value, entityType); }}>
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("placeholder")} aria-label={t("inputLabel")} className="min-w-0 flex-1 rounded-full border border-slate-300 px-5 py-3" />
      <select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label={t("entityType")} className="rounded-full border border-slate-300 px-5 py-3 font-bold text-[#0F4C5C]"><option value="all">{t("allEntities")}</option><option value="project">{t("projects")}</option><option value="listing">{t("listings")}</option><option value="contract">{t("contracts")}</option><option value="file">{t("files")}</option></select>
      <button disabled={loading || query.trim().length < 2} className="rounded-full bg-[#009A44] px-7 py-3 font-bold text-white disabled:opacity-50">{loading ? t("searching") : t("search")}</button>
    </form>

    <section className="mt-6 grid gap-3">
      {!submitted ? <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">{t("hint")}</div> : !loading && items.length === 0 ? <div className="rounded-3xl border border-slate-200 p-12 text-center text-slate-500">{t("noResults", { query: submitted })}</div> : items.map((item, index) => { const href = safeHref(item.metadata?.href); return <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{t.has(`entity.${item.entityType}`) ? t(`entity.${item.entityType}`) : item.entityType}</span><h2 className="mt-3 text-xl font-bold text-[#0F4C5C]">{href ? <Link href={href}>{item.title}</Link> : item.title}</h2></div><span className="text-xs font-bold text-[#009A44]">{t("rank", { position: index + 1, rank: Number(item.rank).toFixed(3) })}</span></div>
        <p className="mt-3 line-clamp-3 leading-6 text-slate-600"><Highlight value={item.highlight || item.body.slice(0, 280)} query={submitted} /></p>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{item.metadata?.status ?? t("indexedEntity")}</span><time dateTime={item.indexedAt}>{time(item.indexedAt)}</time></div>
      </article>; })}
      {cursor ? <button type="button" disabled={loading} onClick={() => void search(cursor, true)} className="rounded-2xl border border-slate-300 py-3 font-bold text-[#0F4C5C]">{t("loadMore")}</button> : null}
    </section>
  </main>;
}
