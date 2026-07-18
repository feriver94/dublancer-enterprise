"use client";

import Link from "next/link";
import { MetricCard, AIWidget, QuickActions } from "@/components/dashboard";
import { Card, Badge } from "@/components/ui";
import { useApiResource } from "@/lib/client/use-api-resource";

type Project = {
  id: string;
  title: string;
  status: string;
  budgetMinor?: string | null;
  currency: string;
  updatedAt: string;
};

const money = (minor: string | null | undefined, currency: string) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(minor ?? 0) / 100);

export default function DashboardClient() {
  const projects = useApiResource<Project[]>("/api/projects?take=100");
  const active = projects.data?.filter((project) => ["OPEN", "IN_PROGRESS"].includes(project.status)).length ?? 0;
  const completed = projects.data?.filter((project) => project.status === "COMPLETED").length ?? 0;
  const recent = [...(projects.data ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return (
    <div style={{ padding: "72px 0", display: "grid", gap: 24 }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-bold uppercase tracking-widest text-[#009A44]">Role-aware command center</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Dashboard</h1></div>
        <button type="button" onClick={() => void projects.refresh()} className="rounded-full border border-slate-300 px-5 py-2 font-bold text-[#0F4C5C]">Refresh</button>
      </div>
      {projects.error ? <p className="enterprise-error" role="alert">{projects.error}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        <MetricCard title="Active Projects" value={projects.loading ? "…" : String(active)} change="Live" variant="success" />
        <MetricCard title="All Projects" value={projects.loading ? "…" : String(projects.data?.length ?? 0)} change="Tenant scoped" variant="info" />
        <MetricCard title="Completed" value={projects.loading ? "…" : String(completed)} change="Delivered" variant="neutral" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}><AIWidget /><QuickActions onChanged={() => void projects.refresh()} /></div>
      <Card variant="elevated">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#0F4C5C]">Recent projects</h2><Link href="/workspace" className="font-bold text-[#009A44]">View workspace</Link></div>
        {projects.loading ? <p className="enterprise-loading">Loading projects…</p> : recent.length ? <div className="grid gap-3">{recent.map((project) => <Link key={project.id} href={`/workspace/project/${project.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 hover:border-[#009A44]"><div><h3 className="font-bold text-[#0F4C5C]">{project.title}</h3><p className="text-sm text-slate-500">{money(project.budgetMinor, project.currency)}</p></div><Badge variant={project.status === "COMPLETED" ? "success" : "info"}>{project.status.replaceAll("_", " ")}</Badge></Link>)}</div> : <p className="enterprise-empty">No projects yet. Use Create Project to begin.</p>}
      </Card>
    </div>
  );
}
