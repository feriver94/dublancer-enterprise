"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiMutation } from "@/lib/client/api-client";
import type { AppLocale } from "@/i18n/config";
import { formatAed, formatUaeDate, formatUaeDateTime } from "@/lib/locale/formatters";

type Metric = { id: string; date: string; metric: string; dimensionKey: string; value: string; updatedAt: string };
type Summary = {
  windowDays: number;
  live: { activeProjects: number; activeContracts: number; invoices: { _count: number; _sum: { totalMinor: string | null } }; files: number; searches: number };
  freshness: { latestCompletedAt: string | null; latestMetricAt: string | null; stale: boolean };
  metrics: Metric[];
  metricDefinitions: Array<{ metric: string; dimensionKey: string }>;
  nextCursor: string | null;
};

function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
function MetricChart({ metrics }: { metrics: Metric[] }) {
  const t = useTranslations("Analytics");
  const totals = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const metric of metrics.filter((item) => item.dimensionKey === "all")) byDate.set(metric.date.slice(0, 10), (byDate.get(metric.date.slice(0, 10)) ?? 0) + Number(metric.value));
    return [...byDate].sort(([left], [right]) => left.localeCompare(right)).slice(-30);
  }, [metrics]);
  const maximum = Math.max(1, ...totals.map(([, value]) => value));
  if (!totals.length) return <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">{t("emptyTrend")}</div>;
  return <div className="flex h-48 items-end gap-1 rounded-2xl bg-slate-50 p-4" aria-label={t("dailyTrendLabel")}>{totals.map(([key, value]) => <div key={key} className="group flex min-w-0 flex-1 flex-col items-center justify-end" title={`${key}: ${value}`}><span className="mb-1 hidden text-[9px] font-bold group-hover:block">{value}</span><div className="w-full rounded-t bg-[#009A44]" style={{ height: `${Math.max(3, (value / maximum) * 150)}px` }} /><span className="mt-1 hidden text-[8px] text-slate-500 lg:block">{key.slice(5)}</span></div>)}</div>;
}

export function AnalyticsDashboardClient({ canBackfill }: { canBackfill: boolean }) {
  const t = useTranslations("Analytics");
  const locale = useLocale() as AppLocale;
  const date = (value: string) => formatUaeDate(value, locale);
  const dateTime = (value?: string | null) => value ? formatUaeDateTime(value, locale) : t("never");
  const amount = (value?: string | null) => formatAed(Number(value ?? 0) / 100, locale);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState("");
  const [dimension, setDimension] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    setLoading(true); setError("");
    try {
      const parameters = new URLSearchParams({ days: String(days), take: "100" });
      if (metric) parameters.set("metric", metric);
      if (dimension) parameters.set("dimensionKey", dimension);
      if (cursor) parameters.set("cursor", cursor);
      const result = await apiGet<Summary>(`/api/analytics/summary?${parameters}`);
      setSummary((current) => append && current ? { ...result, metrics: [...current.metrics, ...result.metrics] } : result);
    } catch (reason) { setError(message(reason, t("loadFailed"))); }
    finally { setLoading(false); }
  }, [days, dimension, metric]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    const source = new EventSource("/api/realtime/stream");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { eventType?: string };
        if (!payload.eventType?.startsWith("analytics.")) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void load(), 250);
      } catch { /* ignore non-product events */ }
    };
    const interval = setInterval(() => void load(), 60_000);
    return () => { clearInterval(interval); if (refreshTimer.current) clearTimeout(refreshTimer.current); source.close(); };
  }, [load]);

  async function backfill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/analytics/backfill", "POST", { from: form.get("from"), to: form.get("to"), idempotencyKey: crypto.randomUUID() });
      setNotice(t("backfillQueued"));
    } catch (reason) { setError(message(reason, t("backfillFailed"))); }
    finally { setBusy(false); }
  }

  const definitions = summary?.metricDefinitions ?? [];
  const dimensions = [...new Set(definitions.filter((item) => !metric || item.metric === metric).map((item) => item.dimensionKey))];
  const [{ today, prior }] = useState(() => {
    const now = new Date();
    return { today: now.toISOString().slice(0, 10), prior: new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10) };
  });

  return <main className="py-12 lg:py-16">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold uppercase tracking-[.18em] text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1><p className="mt-2 text-slate-600">{t("description")}</p></div><span className={`rounded-full px-4 py-2 text-xs font-bold ${summary?.freshness.stale ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{summary?.freshness.stale ? t("stale") : t("fresh")} · {dateTime(summary?.freshness.latestCompletedAt)}</span></header>
    {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : null}
    {notice ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</div> : null}
    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
      [t("activeProjects"), summary?.live.activeProjects ?? 0], [t("activeContracts"), summary?.live.activeContracts ?? 0], [t("governedFiles"), summary?.live.files ?? 0], [t("searchesWindow"), summary?.live.searches ?? 0], [t("invoiceValue"), amount(summary?.live.invoices._sum.totalMinor)],
    ].map(([label, value]) => <article key={label} className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#0F4C5C]">{value}</p></article>)}</section>

    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3"><h2 className="me-auto text-xl font-bold text-[#0F4C5C]">{t("dailyTrend")}</h2><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"><option value="7">{t("days", { count: 7 })}</option><option value="30">{t("days", { count: 30 })}</option><option value="90">{t("days", { count: 90 })}</option><option value="366">{t("days", { count: 366 })}</option></select><select value={metric} onChange={(event) => { setMetric(event.target.value); setDimension(""); }} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"><option value="">{t("allMetrics")}</option>{[...new Set(definitions.map((item) => item.metric))].map((item) => <option key={item}>{item}</option>)}</select><select value={dimension} onChange={(event) => setDimension(event.target.value)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"><option value="">{t("allDimensions")}</option>{dimensions.map((item) => <option key={item}>{item}</option>)}</select></div>
        {loading && !summary ? <div role="status" className="p-10 text-center text-slate-500">{t("loading")}</div> : <MetricChart metrics={summary?.metrics ?? []} />}
        <div className="mt-5 overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="py-3">{t("date")}</th><th>{t("metric")}</th><th>{t("dimension")}</th><th className="text-end">{t("value")}</th></tr></thead><tbody>{summary?.metrics.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3">{date(item.date)}</td><td className="font-bold text-[#0F4C5C]">{item.metric}</td><td>{item.dimensionKey}</td><td className="text-end font-mono">{item.metric.endsWith(".minor") ? amount(item.value) : item.value}</td></tr>)}</tbody></table></div>
        {summary?.nextCursor ? <button type="button" disabled={loading} onClick={() => void load(summary.nextCursor ?? undefined, true)} className="mt-4 w-full rounded-2xl border border-slate-300 py-3 font-bold">{t("loadMore")}</button> : null}
      </section>
      <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-5"><h2 className="text-xl font-bold text-[#0F4C5C]">{t("controls")}</h2><p className="mt-2 text-sm text-slate-600">{t("controlsDescription")}</p>{canBackfill ? <form className="mt-5 grid gap-4" onSubmit={(event) => void backfill(event)}><label className="grid gap-1 text-sm font-bold">{t("from")}<input type="date" name="from" defaultValue={prior} max={today} required className="rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><label className="grid gap-1 text-sm font-bold">{t("to")}<input type="date" name="to" defaultValue={today} max={today} required className="rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><button disabled={busy} className="rounded-full bg-[#009A44] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? t("queuing") : t("runBackfill")}</button></form> : <p className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-600">{t("backfillPermission")}</p>}<dl className="mt-6 grid gap-3 text-sm"><div><dt className="font-bold text-slate-500">{t("latestMetric")}</dt><dd>{dateTime(summary?.freshness.latestMetricAt)}</dd></div><div><dt className="font-bold text-slate-500">{t("window")}</dt><dd>{t("days", { count: summary?.windowDays ?? days })}</dd></div><div><dt className="font-bold text-slate-500">{t("isolation")}</dt><dd>{t("activeOrganization")}</dd></div></dl></aside>
    </div>
  </main>;
}
