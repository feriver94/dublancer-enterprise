"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MetricCard, AIWidget, QuickActions } from "@/components/dashboard";
import { Card, Badge } from "@/components/ui";
import { useApiResource } from "@/lib/client/use-api-resource";
import type { AppLocale } from "@/i18n/config";
import { formatAed } from "@/lib/locale/formatters";

type Project = {
  id: string;
  title: string;
  status: string;
  budgetMinor?: string | null;
  currency: string;
  updatedAt: string;
};

export default function DashboardClient() {
  const t = useTranslations("Dashboard");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const projects = useApiResource<Project[]>("/api/projects?take=100");
  const active = projects.data?.filter((project) => ["OPEN", "IN_PROGRESS"].includes(project.status)).length ?? 0;
  const completed = projects.data?.filter((project) => project.status === "COMPLETED").length ?? 0;
  const recent = [...(projects.data ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return (
    <div style={{ padding: "72px 0", display: "grid", gap: 24 }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1></div>
        <button type="button" onClick={() => void projects.refresh()} className="rounded-full border border-slate-300 px-5 py-2 font-bold text-[#0F4C5C]">{t("refresh")}</button>
      </div>
      {projects.error ? <p className="enterprise-error" role="alert">{projects.error}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        <MetricCard title={t("activeProjects")} value={projects.loading ? "…" : String(active)} change={t("live")} variant="success" />
        <MetricCard title={t("allProjects")} value={projects.loading ? "…" : String(projects.data?.length ?? 0)} change={t("tenantScoped")} variant="info" />
        <MetricCard title={t("completed")} value={projects.loading ? "…" : String(completed)} change={t("delivered")} variant="neutral" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}><AIWidget /><QuickActions onChanged={() => void projects.refresh()} /></div>
      <Card variant="elevated">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#0F4C5C]">{t("recentProjects")}</h2><Link href="/workspace" className="font-bold text-[#009A44]">{t("viewWorkspace")}</Link></div>
        {projects.loading ? <p className="enterprise-loading">{t("loadingProjects")}</p> : recent.length ? <div className="grid gap-3">{recent.map((project) => <Link key={project.id} href={`/workspace/project/${project.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 hover:border-[#009A44]"><div><h3 className="font-bold text-[#0F4C5C]">{project.title}</h3><p className="text-sm text-slate-500">{formatAed(Number(project.budgetMinor ?? 0) / 100, locale)}</p></div><Badge variant={project.status === "COMPLETED" ? "success" : "info"}>{status.has(project.status) ? status(project.status) : project.status.replaceAll("_", " ")}</Badge></Link>)}</div> : <p className="enterprise-empty">{t("emptyProjects")}</p>}
      </Card>
    </div>
  );
}
