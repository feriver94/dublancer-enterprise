"use client";

import { useState, type FormEvent } from "react";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { Badge, Button, Card } from "@/components/ui";

type Member = { id: string; status: string; roleId: string | null; user: { displayName: string | null; email: string }; role: { id: string; name: string } | null };
type Role = { id: string; name: string };
type Department = { id: string; name: string; description: string | null; _count: { teams: number } };
type Team = { id: string; name: string; description: string | null; department: { id: string; name: string } | null; memberships: unknown[] };
type Dashboard = {
  organization: { id: string; name: string; slug: string; status: string; settings: { dataRegion: string } | null; subscription: { status: string; plan: { name: string } } | null };
  administration: { members: Member[]; roles: Role[]; invitations: Array<{ id: string; email: string; status: string }>; departments: Department[]; teams: Team[] };
  counters: { organizations: number; activeMembers: number; projects: number; departments: number; teams: number; pendingInvitations: number };
  security: { score: number; checks: Array<{ key: string; label: string; weight: number; passed: boolean }>; unresolvedCritical: number; calculatedAt: string };
  auditLog: Array<{ id: string; action: string; resourceType: string; outcome: string; createdAt: string; actor: { displayName: string | null; email: string } | null }>;
};

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export default function EnterpriseControlCenterClient() {
  const dashboard = useApiResource<Dashboard>("/api/enterprise/control-center");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");

  async function mutate<T>(key: string, operation: () => Promise<T>, success: string) {
    setPending(key);
    setNotice("");
    try {
      await operation();
      setNotice(success);
      await dashboard.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setPending("");
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await mutate("organization.create", () => apiMutation("/api/organizations", "POST", { name: formValue(form, "name"), slug: formValue(form, "slug") }), "Organization created. Sign in to that organization to administer it.");
    element.reset();
  }

  async function updateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard.data) return;
    const form = new FormData(event.currentTarget);
    await mutate("organization.update", () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}`, "PATCH", { name: formValue(form, "name"), slug: formValue(form, "slug") }), "Organization updated.");
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard.data) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const roleId = formValue(form, "roleId");
    await mutate("invite", () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}/invitations/bulk`, "POST", { invitations: [{ email: formValue(form, "email"), ...(roleId ? { roleId } : {}), expiresInHours: 168 }] }), "Invitation queued and recorded.");
    element.reset();
  }

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard.data) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    await mutate("department.create", () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}/administration`, "POST", { action: "department.create", name: formValue(form, "name"), description: formValue(form, "description") || undefined }), "Department created.");
    element.reset();
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard.data) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const departmentId = formValue(form, "departmentId");
    await mutate("team.create", () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}/administration`, "POST", { action: "team.create", name: formValue(form, "name"), description: formValue(form, "description") || undefined, ...(departmentId ? { departmentId } : {}) }), "Team created.");
    element.reset();
  }

  async function editUnit(kind: "department" | "team", item: Department | Team) {
    if (!dashboard.data) return;
    const name = window.prompt(`Rename ${kind}`, item.name)?.trim();
    if (!name || name === item.name) return;
    await mutate(`${kind}.update`, () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}/administration`, "POST", { action: `${kind}.update`, id: item.id, name }), `${kind === "team" ? "Team" : "Department"} updated.`);
  }

  async function deleteUnit(kind: "department" | "team", item: Department | Team) {
    if (!dashboard.data || !window.confirm(`Delete ${kind} “${item.name}”?`)) return;
    await mutate(`${kind}.delete`, () => apiMutation(`/api/organizations/${dashboard.data!.organization.id}/administration`, "POST", { action: `${kind}.delete`, id: item.id }), `${kind === "team" ? "Team" : "Department"} deleted.`);
  }

  if (dashboard.loading) return <p className="enterprise-loading py-16">Loading live tenant controls…</p>;
  if (dashboard.error || !dashboard.data) return <p className="enterprise-error py-16">{dashboard.error || "Control center is unavailable."}</p>;
  const data = dashboard.data;
  const counterEntries = [
    ["Organizations", data.counters.organizations], ["Active members", data.counters.activeMembers], ["Projects", data.counters.projects],
    ["Departments", data.counters.departments], ["Teams", data.counters.teams], ["Pending invites", data.counters.pendingInvitations],
  ] as const;

  return <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <header className="mb-8"><Badge variant="success">Live tenant data</Badge><h1 className="mt-4 text-3xl font-black text-[#0F4C5C] sm:text-5xl">Enterprise Control Center</h1><p className="mt-3 max-w-3xl text-slate-600">Manage the active organization, people, departments, teams, security posture, and tenant audit evidence from one operational view.</p></header>
    {notice ? <p role="status" className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-[#0F4C5C]">{notice}</p> : null}
    <section aria-label="Live counters" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">{counterEntries.map(([label, value]) => <Card key={label} variant="elevated" className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#0F4C5C]">{value}</p></Card>)}</section>

    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-8">
        <Card variant="elevated" className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="success">{data.organization.status}</Badge><h2 className="mt-3 text-2xl font-black text-[#0F4C5C]">{data.organization.name}</h2><p className="text-sm text-slate-500">{data.organization.slug} · {data.organization.settings?.dataRegion ?? "Global"} · {data.organization.subscription?.plan.name ?? "No plan"}</p></div></div><form className="enterprise-form mt-6" onSubmit={(event) => void updateOrganization(event)}><label>Name<input name="name" defaultValue={data.organization.name} required minLength={2} /></label><label>Slug<input name="slug" defaultValue={data.organization.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><Button disabled={Boolean(pending)}>{pending === "organization.update" ? "Saving…" : "Save organization"}</Button></form></Card>
        <Card variant="elevated" className="p-6"><h2 className="text-xl font-black text-[#0F4C5C]">Invite users</h2><form className="enterprise-form mt-4" onSubmit={(event) => void invite(event)}><label>Email<input name="email" type="email" required /></label><label>Role<select name="roleId" defaultValue=""><option value="">Default role</option>{data.administration.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><Button disabled={Boolean(pending)}>{pending === "invite" ? "Inviting…" : "Send invitation"}</Button></form><div className="mt-5 grid gap-2">{data.administration.invitations.slice(0, 5).map((item) => <div key={item.id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{item.email}</span><Badge variant="info">{item.status}</Badge></div>)}</div></Card>
        <section className="grid gap-8 lg:grid-cols-2">
          <Card variant="elevated" className="p-6"><h2 className="text-xl font-black text-[#0F4C5C]">Departments</h2><form className="enterprise-form mt-4" onSubmit={(event) => void createDepartment(event)}><label>Name<input name="name" required /></label><label>Description<input name="description" /></label><Button disabled={Boolean(pending)}>Add department</Button></form><div className="mt-5 grid gap-2">{data.administration.departments.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{item.name}</span><div><Button size="sm" variant="ghost" onClick={() => void editUnit("department", item)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void deleteUnit("department", item)}>Delete</Button></div></div><p className="text-xs text-slate-500">{item._count.teams} teams</p></div>)}</div></Card>
          <Card variant="elevated" className="p-6"><h2 className="text-xl font-black text-[#0F4C5C]">Teams</h2><form className="enterprise-form mt-4" onSubmit={(event) => void createTeam(event)}><label>Name<input name="name" required /></label><label>Department<select name="departmentId" defaultValue=""><option value="">No department</option>{data.administration.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Description<input name="description" /></label><Button disabled={Boolean(pending)}>Add team</Button></form><div className="mt-5 grid gap-2">{data.administration.teams.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{item.name}</span><div><Button size="sm" variant="ghost" onClick={() => void editUnit("team", item)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void deleteUnit("team", item)}>Delete</Button></div></div><p className="text-xs text-slate-500">{item.department?.name ?? "Independent"} · {item.memberships.length} members</p></div>)}</div></Card>
        </section>
        <Card variant="elevated" className="p-6"><h2 className="text-xl font-black text-[#0F4C5C]">Create another organization</h2><p className="mt-2 text-sm text-slate-500">A new isolated tenant receives default roles, security policy, and a starter trial.</p><form className="enterprise-form mt-4" onSubmit={(event) => void createOrganization(event)}><label>Name<input name="name" required minLength={2} /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><Button disabled={Boolean(pending)}>{pending === "organization.create" ? "Creating…" : "Create organization"}</Button></form></Card>
      </div>
      <aside className="grid content-start gap-8">
        <Card variant="elevated" className="p-6"><div className="flex items-end justify-between"><div><p className="text-sm text-slate-500">Calculated security score</p><p className="mt-2 text-5xl font-black text-[#009A44]">{data.security.score}%</p></div><Badge variant={data.security.score >= 80 ? "success" : "danger"}>{data.security.unresolvedCritical} critical</Badge></div><div className="mt-6 grid gap-3">{data.security.checks.map((check) => <div key={check.key} className="flex items-start justify-between gap-3 border-b pb-3 text-sm"><span>{check.label}</span><strong className={check.passed ? "text-[#009A44]" : "text-amber-700"}>{check.passed ? `+${check.weight}` : "Action needed"}</strong></div>)}</div></Card>
        <Card variant="elevated" className="p-6"><h2 className="text-xl font-black text-[#0F4C5C]">Audit log</h2><div className="mt-5 grid gap-4">{data.auditLog.length ? data.auditLog.map((event) => <article key={event.id} className="border-b pb-3"><div className="flex justify-between gap-2"><strong className="text-sm text-[#0F4C5C]">{event.action}</strong><Badge variant={event.outcome === "SUCCESS" ? "success" : "danger"}>{event.outcome}</Badge></div><p className="mt-1 text-xs text-slate-500">{event.actor?.displayName ?? event.actor?.email ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p></article>) : <p className="text-sm text-slate-500">Audit events will appear as tenant actions occur.</p>}</div></Card>
      </aside>
    </div>
  </main>;
}
